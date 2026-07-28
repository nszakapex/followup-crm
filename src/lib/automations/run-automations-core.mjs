import { createClient } from "@supabase/supabase-js";
import {
  getAutomationTemplateForBusiness,
  getWorkflowReason,
} from "../business-verticals/verticals.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROGRESSED_STATUSES = new Set(["booked", "completed", "review_requested", "lost"]);
const ACTIVE_ACTION_STATUSES = ["pending_review", "approved_pending_send", "sent", "blocked", "send_failed"];
const LEAD_SELECT =
  "id, first_name, last_name, phone, email, source, service_interest, status, notes, opted_out, created_at, last_contacted_at";
const AUTOMATION_SELECT =
  "id, business_id, name, type, enabled, delay_hours, trigger_status, message_template, channel, last_triggered_at, trigger_count";
const BUSINESS_SELECT =
  "id, name, industry, owner_email, google_review_link, twilio_from_number, sms_compliance_status, resend_from_email";

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function getDatabaseError(action, message) {
  return isDevelopment() ? `${action}: ${message}` : action;
}

function isUniqueViolation(error) {
  return error && error.code === "23505";
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase URL or service role key.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes((value || "").toLowerCase());
}

function isApprovedSmsStatus(value) {
  const normalized = (value || "").trim().toLowerCase().replaceAll("-", "_");
  return ["approved", "active", "verified", "complete", "completed"].includes(normalized);
}

function isExplicitlyFalse(value) {
  return ["0", "false", "no", "off"].includes((value || "").toLowerCase());
}

function shouldSkipDelivery() {
  if (isTruthy(process.env.REVIEW_REQUEST_TEST_MODE)) return true;
  if (isTruthy(process.env.REVIEW_REQUEST_SKIP_DELIVERY)) return true;

  return (
    process.env.NODE_ENV !== "production" &&
    !isExplicitlyFalse(process.env.REVIEW_REQUEST_TEST_MODE) &&
    !isExplicitlyFalse(process.env.REVIEW_REQUEST_SKIP_DELIVERY)
  );
}

function getSmsReadiness(business) {
  const provider = (process.env.SMS_PROVIDER || "mock").toLowerCase();
  const complianceApproved =
    isTruthy(process.env.SMS_COMPLIANCE_APPROVED) ||
    isApprovedSmsStatus(process.env.SMS_COMPLIANCE_STATUS) ||
    isApprovedSmsStatus(process.env.TWILIO_A2P_CAMPAIGN_STATUS) ||
    isApprovedSmsStatus(business.sms_compliance_status);

  if (provider === "mock") {
    return {
      configured: false,
      reason: "Mock SMS provider cannot send live SMS.",
    };
  }

  if (provider === "twilio") {
    const accountConfigured = Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    );
    const senderConfigured = Boolean(
      process.env.TWILIO_MESSAGING_SERVICE_SID ||
        business.twilio_from_number ||
        process.env.TWILIO_FROM_NUMBER ||
        process.env.TWILIO_PHONE_NUMBER
    );

    return {
      configured: accountConfigured && senderConfigured && complianceApproved,
      reason: !accountConfigured
        ? "SMS provider is not configured."
        : !senderConfigured
          ? "SMS sender is not configured."
          : !complianceApproved
            ? "SMS compliance approval is not recorded yet."
            : null,
    };
  }

  return {
    configured: false,
    reason: "Selected SMS provider is not implemented yet.",
  };
}

function getEmailReadiness(business) {
  const configured = Boolean(
    process.env.RESEND_API_KEY && (business.resend_from_email || process.env.RESEND_FROM_EMAIL)
  );

  return {
    configured,
    reason: configured ? null : "Email provider is not configured.",
  };
}

function renderTemplate(template, business, lead) {
  const values = {
    first_name: lead.first_name || "",
    last_name: lead.last_name || "",
    business_name: business.name || "",
    google_review_link: business.google_review_link || "",
    service_interest: lead.service_interest || "your request",
    firstName: lead.first_name || "",
    lastName: lead.last_name || "",
    businessName: business.name || "",
    reviewLink: business.google_review_link || "",
    serviceInterest: lead.service_interest || "your request",
  };

  return template.replace(
    /\{\{\s*(first_name|last_name|business_name|google_review_link|service_interest|firstName|lastName|businessName|reviewLink|serviceInterest)\s*\}\}/g,
    (_, key) => values[key] || ""
  );
}

function isOldEnough(automation, lead, now) {
  const delayHours = Number(automation.delay_hours || 0);
  if (delayHours <= 0) return true;

  const anchor =
    automation.type === "twenty_four_hour_followup" ||
    automation.type === "three_day_followup" ||
    automation.type === "seven_day_followup"
      ? lead.last_contacted_at || lead.created_at
      : lead.created_at;
  const anchorDate = new Date(anchor);
  const ageMs = now.getTime() - anchorDate.getTime();

  return ageMs >= delayHours * 60 * 60 * 1000;
}

function leadMatchesAutomation(automation, lead, business, now) {
  if (automation.type === "weekly_owner_summary") {
    return { eligible: false, reason: "Weekly owner summaries are evaluation-only in this phase." };
  }

  if (automation.type === "review_request") {
    if (lead.status !== "completed") {
      return { eligible: false, reason: "Lead is not completed." };
    }
    if (!business.google_review_link) {
      return { eligible: false, reason: "Review link is not configured." };
    }
    if (!isOldEnough(automation, lead, now)) {
      return { eligible: false, reason: "Lead has not reached the automation delay yet." };
    }
    return { eligible: true, action: "create_review_request" };
  }

  if (automation.type === "missed_call_textback") {
    const haystack = `${lead.source || ""} ${lead.notes || ""}`.toLowerCase();
    if (lead.status !== "new" || !haystack.includes("missed")) {
      return { eligible: false, reason: "Lead is not a missed-call new lead." };
    }
    if (!isOldEnough(automation, lead, now)) {
      return { eligible: false, reason: "Lead has not reached the automation delay yet." };
    }
    return { eligible: true, action: "send_message" };
  }

  if (automation.trigger_status && lead.status !== automation.trigger_status) {
    return { eligible: false, reason: `Lead status is ${lead.status}, not ${automation.trigger_status}.` };
  }

  if (PROGRESSED_STATUSES.has(lead.status)) {
    return { eligible: false, reason: "Lead is already progressed or closed." };
  }

  if (!isOldEnough(automation, lead, now)) {
    return { eligible: false, reason: "Lead has not reached the automation delay yet." };
  }

  return { eligible: true, action: "send_message" };
}

function validateContact(automation, lead) {
  if (automation.channel === "sms") {
    if (lead.opted_out) return "This customer has opted out.";
    if (!lead.phone) return "Customer phone number is required.";
  }

  if (automation.channel === "email" && !lead.email) {
    return "Customer email is required.";
  }

  if (automation.channel !== "sms" && automation.channel !== "email") {
    return "Unsupported automation channel.";
  }

  return null;
}

function normalizeDestination(channel, lead) {
  if (channel === "sms") {
    const digits = (lead.phone || "").replace(/\D/g, "");
    return digits || (lead.phone || "").trim() || null;
  }

  if (channel === "email") {
    return (lead.email || "").trim().toLowerCase() || null;
  }

  return null;
}

function getDestinationSummary(channel, lead) {
  if (channel === "sms") {
    const digits = (lead.phone || "").replace(/\D/g, "");
    if (digits.length >= 4) return `SMS ending in ${digits.slice(-4)}`;
    return lead.phone ? "SMS destination recorded" : "No SMS destination";
  }

  if (channel === "email") {
    const [local, domain] = (lead.email || "").split("@");
    if (local && domain) return `${local.charAt(0)}${local.length > 1 ? "***" : ""}@${domain}`;
    return lead.email ? "Email destination recorded" : "No email destination";
  }

  return "No send destination";
}

function getSequenceActionType(automation, match) {
  if (match.action === "create_review_request") return "review_request_initial";
  if (automation.type === "missed_call_textback") return "missed_call_initial";
  if (automation.type === "instant_lead_reply") return "new_lead_initial";
  if (automation.type === "twenty_four_hour_followup") return "new_lead_followup_1";
  if (automation.type === "three_day_followup") return "no_response_followup";
  if (automation.type === "seven_day_followup") return "new_lead_final";
  return automation.type;
}

function getActionKey(automation, lead, match, business) {
  const destination = normalizeDestination(automation.channel, lead);
  if (!destination) return null;

  return `automation:${business.id}:lead:${lead.id}:${getSequenceActionType(automation, match)}:${automation.channel}:${destination}`;
}

function getLegacyActionKey(automation, lead) {
  return `automation:${automation.type}:lead:${lead.id}`;
}

function getReviewRequestDedupeKey(business, automation, lead) {
  const destination = normalizeDestination(automation.channel, lead);
  if (!destination) return null;

  return `review_request:${business.id}:lead:${lead.id}:${automation.channel}:${destination}`;
}

async function hasDuplicateAction(supabase, businessId, actionKeys) {
  const { data, error } = await supabase
    .from("automation_actions")
    .select("id")
    .eq("business_id", businessId)
    .in("dedupe_key", actionKeys)
    .in("status", ACTIVE_ACTION_STATUSES)
    .limit(1);

  if (error) return { duplicate: false, error };

  return { duplicate: Boolean(data && data.length > 0), error: null };
}

async function hasDuplicateReviewRequest(supabase, businessId, dedupeKey) {
  if (!dedupeKey) return { duplicate: false, error: null };

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data, error } = await supabase
    .from("review_requests")
    .select("id")
    .eq("business_id", businessId)
    .eq("dedupe_key", dedupeKey)
    .gte("created_at", since.toISOString())
    .or(
      "status.in.(pending,sent,clicked,completed,duplicate_prevented),send_status.in.(not_attempted,skipped,sent,duplicate_prevented)"
    )
    .limit(1);

  if (error) return { duplicate: false, error };
  return { duplicate: Boolean(data && data.length > 0), error: null };
}

async function logAutomationEvent(supabase, params) {
  const { error } = await supabase.from("audit_logs").insert({
    business_id: params.businessId,
    user_id: null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata_json: params.metadata,
  });

  return error;
}

function getLeadName(lead) {
  return `${lead.first_name || "Customer"} ${lead.last_name || ""}`.trim();
}

function getActionType(match) {
  return match.action === "create_review_request"
    ? "review_request"
    : "follow_up_message";
}

function getActionTitle(automation, lead, match) {
  const leadName = getLeadName(lead);
  return match.action === "create_review_request"
    ? `Review request for ${leadName}`
    : `${automation.name} for ${leadName}`;
}

function getActionSummary(automation, lead, match) {
  const contact = automation.channel === "sms" ? lead.phone : lead.email;
  const channel = automation.channel === "sms" ? "SMS" : "email";

  if (match.action === "create_review_request") {
    return `${getLeadName(lead)} is marked completed and can be reviewed before any review request is sent.`;
  }

  return `${getLeadName(lead)} matched ${automation.name}. Suggested ${channel} follow-up is ready for review${contact ? "" : ", but contact details should be checked"}.`;
}

function getActionReason(automation, lead, match, business) {
  if (match.action === "create_review_request") {
    return getWorkflowReason(
      business.industry,
      "review_request_initial",
      "Lead is completed and eligible for an honest Google review request."
    );
  }

  if (automation.type === "missed_call_textback") {
    return getWorkflowReason(
      business.industry,
      "missed_call_initial",
      "Lead appears to be a missed-call new lead."
    );
  }

  if (automation.trigger_status) {
    return getWorkflowReason(
      business.industry,
      getSequenceActionType(automation, match),
      `Lead status matched ${automation.trigger_status}.`
    );
  }

  return getWorkflowReason(
    business.industry,
    getSequenceActionType(automation, match),
    "Lead matched the automation eligibility rules."
  );
}

function buildActionMetadata(automation, lead, match, business, now) {
  const createdAt = new Date(lead.created_at);
  const daysSinceCreated = Math.max(
    0,
    Math.floor((now.getTime() - createdAt.getTime()) / 86400000)
  );

  return {
    runMode: "confirmed",
    candidateId: lead.id,
    candidateType: "lead",
    automationId: automation.id,
    automationType: automation.type,
    sequenceActionType: getSequenceActionType(automation, match),
    automationName: automation.name,
    automationChannel: automation.channel,
    eligibilityAction: match.action,
    eligibilityReason: getActionReason(automation, lead, match, business),
    leadStatus: lead.status,
    leadSource: lead.source || null,
    daysSinceCreated,
    lastContactedAt: lead.last_contacted_at || null,
    destinationSummary: getDestinationSummary(automation.channel, lead),
    manualApprovalRequired: true,
    nextOperatorAction: "Review and manually approve this action when ready.",
    reviewLinkConfigured: Boolean(business.google_review_link),
    providerDelivery: "not_called",
  };
}

async function createPendingAutomationAction(
  supabase,
  business,
  automation,
  lead,
  body,
  match,
  actionKey,
  now
) {
  const { data, error } = await supabase
    .from("automation_actions")
    .insert({
      business_id: business.id,
      lead_id: lead.id,
      review_request_id: null,
      action_type: getActionType(match),
      status: "pending_review",
      channel: automation.channel,
      title: getActionTitle(automation, lead, match),
      summary: getActionSummary(automation, lead, match),
      suggested_message: body,
      reason: getActionReason(automation, lead, match, business),
      reason_code: getSequenceActionType(automation, match),
      source: "automation_run",
      run_id: null,
      audit_log_id: null,
      dedupe_key: actionKey,
      metadata_json: buildActionMetadata(automation, lead, match, business, now),
    })
    .select("id")
    .single();

  return { id: data && data.id, error };
}

async function incrementAutomationCounters(supabase, automation, count, nowIso) {
  const { error } = await supabase
    .from("automations")
    .update({
      last_triggered_at: nowIso,
      trigger_count: Number(automation.trigger_count || 0) + count,
    })
    .eq("id", automation.id)
    .eq("business_id", automation.business_id);

  return error;
}

function makeResult(automation, lead, action, reason, duplicatePrevented) {
  return {
    automationId: automation.id,
    automationType: automation.type,
    entityType: "lead",
    entityId: lead.id,
    action,
    reason,
    duplicatePrevented,
  };
}

export async function runAutomationsCore(options) {
  const businessId = options && options.businessId;
  const dryRun = options && Object.prototype.hasOwnProperty.call(options, "dryRun")
    ? Boolean(options.dryRun)
    : true;
  const allowProviderSends = Boolean(options && options.allowProviderSends);
  const limit = Math.max(1, Math.min(Number((options && options.limit) || 50), 200));
  const now = options && options.now ? new Date(options.now) : new Date();
  const nowIso = now.toISOString();
  const results = [];
  const countsByAutomation = new Map();
  let evaluated = 0;
  let eligible = 0;
  let actionsCreated = 0;
  let skipped = 0;
  let failures = 0;
  let duplicatesPrevented = 0;

  if (!businessId) {
    return { success: false, error: "Business id is required." };
  }

  if (!UUID_RE.test(businessId)) {
    return { success: false, error: "Invalid business id." };
  }

  let supabase;

  try {
    supabase = createServiceClient();
  } catch (error) {
    return {
      success: false,
      error: "Automation runner is not configured.",
      details: isDevelopment() && error instanceof Error ? error.message : undefined,
    };
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select(BUSINESS_SELECT)
    .eq("id", businessId)
    .maybeSingle();

  if (businessError) {
    return {
      success: false,
      error: getDatabaseError("Business lookup failed", businessError.message),
    };
  }

  if (!business) {
    return { success: false, error: "Business not found." };
  }

  const { data: automationsData, error: automationsError } = await supabase
    .from("automations")
    .select(AUTOMATION_SELECT)
    .eq("business_id", businessId)
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (automationsError) {
    return {
      success: false,
      error: getDatabaseError("Automation lookup failed", automationsError.message),
    };
  }

  const automations = automationsData || [];

  if (automations.length === 0) {
    return {
      success: true,
      dryRun,
      businessId,
      evaluated: 0,
      eligible: 0,
      actionsCreated: 0,
      skipped: 0,
      failures: 0,
      duplicatesPrevented: 0,
      providerSendsAllowed: allowProviderSends,
      deliverySkipped: shouldSkipDelivery(),
      results: [],
    };
  }

  const { data: leadsData, error: leadsError } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit * 4);

  if (leadsError) {
    return {
      success: false,
      error: getDatabaseError("Lead lookup failed", leadsError.message),
    };
  }

  const leads = leadsData || [];
  const deliverySkipped = shouldSkipDelivery();
  const smsReadiness = getSmsReadiness(business);
  const emailReadiness = getEmailReadiness(business);

  outer:
  for (const automation of automations) {
    let createdForAutomation = 0;

    for (const lead of leads) {
      if (results.length >= limit) break outer;

      evaluated += 1;
      const match = leadMatchesAutomation(automation, lead, business, now);

      if (!match.eligible) continue;

      const contactError = validateContact(automation, lead);
      if (contactError) {
        skipped += 1;
        results.push(makeResult(automation, lead, "skipped", contactError));
        continue;
      }

      if (automation.channel === "sms" && !deliverySkipped && allowProviderSends && !smsReadiness.configured) {
        skipped += 1;
        results.push(makeResult(automation, lead, "skipped", smsReadiness.reason || "SMS provider is not configured."));
        continue;
      }

      if (automation.channel === "email" && !deliverySkipped && allowProviderSends && !emailReadiness.configured) {
        skipped += 1;
        results.push(makeResult(automation, lead, "skipped", emailReadiness.reason || "Email provider is not configured."));
        continue;
      }

      if (allowProviderSends && !deliverySkipped) {
        skipped += 1;
        results.push(
          makeResult(
            automation,
            lead,
            "skipped",
            "Real provider sends are not implemented in the Phase 6 runner."
          )
        );
        continue;
      }

      const actionKey = getActionKey(automation, lead, match, business);
      const legacyActionKey = getLegacyActionKey(automation, lead);

      if (!actionKey) {
        skipped += 1;
        results.push(makeResult(automation, lead, "skipped", "Destination identity is required."));
        continue;
      }

      const duplicateCheck = await hasDuplicateAction(supabase, businessId, [
        actionKey,
        legacyActionKey,
      ]);

      if (duplicateCheck.error) {
        failures += 1;
        results.push(
          makeResult(
            automation,
            lead,
            "failed",
            getDatabaseError("Duplicate lookup failed", duplicateCheck.error.message)
          )
        );
        continue;
      }

      if (duplicateCheck.duplicate) {
        skipped += 1;
        duplicatesPrevented += 1;
        results.push(
          makeResult(
            automation,
            lead,
            "skipped",
            "Duplicate automation action skipped.",
            true
          )
        );
        continue;
      }

      if (match.action === "create_review_request") {
        const reviewDuplicateCheck = await hasDuplicateReviewRequest(
          supabase,
          businessId,
          getReviewRequestDedupeKey(business, automation, lead)
        );

        if (reviewDuplicateCheck.error) {
          failures += 1;
          results.push(
            makeResult(
              automation,
              lead,
              "failed",
              getDatabaseError("Review request duplicate lookup failed", reviewDuplicateCheck.error.message)
            )
          );
          continue;
        }

        if (reviewDuplicateCheck.duplicate) {
          skipped += 1;
          duplicatesPrevented += 1;
          results.push(
            makeResult(
              automation,
              lead,
              "skipped",
              "Duplicate review request skipped.",
              true
            )
          );
          continue;
        }
      }

      eligible += 1;

      if (dryRun) {
        results.push(
          makeResult(
            automation,
            lead,
            match.action === "create_review_request"
              ? "would_create_review_request"
              : "would_send_message",
            "Automation runner is in dry-run mode. No actions were created."
          )
        );
        continue;
      }

      const template = getAutomationTemplateForBusiness({
        business,
        automationType: automation.type,
        templateKey: getSequenceActionType(automation, match),
        currentTemplate: automation.message_template || "",
      });
      const body = renderTemplate(template, business, lead);

      if (!body.trim()) {
        skipped += 1;
        results.push(makeResult(automation, lead, "skipped", "Automation message template is empty."));
        continue;
      }

      const actionResult =
        await createPendingAutomationAction(
          supabase,
          business,
          automation,
          lead,
          body,
          match,
          actionKey,
          now
        );

      if (actionResult.error || !actionResult.id) {
        if (isUniqueViolation(actionResult.error)) {
          skipped += 1;
          duplicatesPrevented += 1;
          results.push(
            makeResult(
              automation,
              lead,
              "skipped",
              "Duplicate automation action skipped.",
              true
            )
          );
          continue;
        }

        failures += 1;
        const reason = getDatabaseError(
          "Automation action failed",
          actionResult.error ? actionResult.error.message : "No action id returned."
        );
        results.push(makeResult(automation, lead, "failed", reason));
        await logAutomationEvent(supabase, {
          businessId,
          action: "automation.failed",
          entityType: "lead",
          entityId: lead.id,
          metadata: {
            automation_id: automation.id,
            automation_type: automation.type,
            action_key: actionKey,
            reason,
          },
        });
        continue;
      }

      const auditError = await logAutomationEvent(supabase, {
        businessId,
        action: "automation.action_created",
        entityType: "lead",
        entityId: lead.id,
        metadata: {
          automation_id: automation.id,
          automation_type: automation.type,
          action_key: actionKey,
          created_entity_id: actionResult.id,
          created_entity_type: "automation_action",
          provider_delivery: "not_called",
        },
      });

      if (auditError) {
        failures += 1;
        results.push(
          makeResult(
            automation,
            lead,
            "failed",
            getDatabaseError("Automation audit log failed", auditError.message)
          )
        );
        continue;
      }

      actionsCreated += 1;
      createdForAutomation += 1;
      results.push(
        makeResult(
          automation,
          lead,
          "created_pending_action",
          "Pending automation action created for review. No provider delivery occurred."
        )
      );
    }

    if (!dryRun && createdForAutomation > 0) {
      countsByAutomation.set(automation.id, {
        automation,
        count: createdForAutomation,
      });
    }
  }

  if (!dryRun) {
    for (const { automation, count } of countsByAutomation.values()) {
      const counterError = await incrementAutomationCounters(
        supabase,
        automation,
        count,
        nowIso
      );

      if (counterError) {
        failures += 1;
        results.push({
          automationId: automation.id,
          automationType: automation.type,
          entityType: "lead",
          entityId: businessId,
          action: "failed",
          reason: getDatabaseError("Automation counter update failed", counterError.message),
        });
      }
    }
  }

  return {
    success: true,
    dryRun,
    businessId,
    evaluated,
    eligible,
    actionsCreated,
    skipped,
    failures,
    duplicatesPrevented,
    providerSendsAllowed: allowProviderSends,
    deliverySkipped,
    results,
  };
}
