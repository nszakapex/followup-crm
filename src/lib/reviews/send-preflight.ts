import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  getReviewProviderReadiness,
  type ReviewProviderChannel,
  type ReviewProviderCodePath,
  type ReviewSendMode,
} from "@/lib/reviews/provider-readiness";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ManualReviewPreflightOutcome =
  | "sent"
  | "blocked"
  | "duplicate_prevented"
  | "not_attempted";
export type DuplicateRisk = "none" | "possible" | "blocked";

export type ManualReviewSendPreflight = {
  canCreateReviewRequest: boolean;
  canAttemptLiveSend: boolean;
  outcomeIfSubmitted: ManualReviewPreflightOutcome;
  mode: ReviewSendMode;
  safeReason: string;
  warnings: string[];
  blockingIssues: string[];
  missingFields: string[];
  confirmationRequired: boolean;
  confirmationTitle: string;
  confirmationBody: string;
  submitLabel: string;
  destinationSummary: string;
  providerLabel: string;
  duplicateRisk: DuplicateRisk;
};

type BusinessRow = {
  id: string;
  name: string;
  google_review_link: string | null;
  twilio_from_number: string | null;
  resend_from_email: string | null;
};

type LeadRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  opted_out: boolean;
};

type AutomationActionRow = {
  id: string;
  business_id: string;
  lead_id: string | null;
  status: string;
  channel: string | null;
  action_type: string;
};

type ManualReviewSendPreflightParams = {
  businessId: string;
  leadId: string;
  channel: ReviewProviderChannel;
  source: ReviewProviderCodePath;
  automationActionId?: string | null;
};

const RECENT_DUPLICATE_WINDOW_DAYS = 7;

function normalizeEmail(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

function normalizePhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || value?.trim() || null;
}

function getDedupeContact({
  channel,
  phone,
  email,
}: {
  channel: ReviewProviderChannel;
  phone: string | null;
  email: string | null;
}) {
  return channel === "sms" ? normalizePhone(phone) : normalizeEmail(email);
}

function getDestinationSummary(channel: ReviewProviderChannel, lead: LeadRow | null) {
  if (!lead) return "No customer selected";

  if (channel === "sms") {
    const digits = lead.phone?.replace(/\D/g, "") ?? "";
    if (digits.length >= 4) return `SMS ending in ${digits.slice(-4)}`;
    return lead.phone ? "SMS destination recorded" : "No SMS destination";
  }

  const [local, domain] = lead.email?.split("@") ?? [];
  if (local && domain) {
    return `${local.charAt(0)}${local.length > 1 ? "***" : ""}@${domain}`;
  }

  return lead.email ? "Email destination recorded" : "No email destination";
}

function buildDedupeKey({
  businessId,
  leadId,
  channel,
  phone,
  email,
}: {
  businessId: string;
  leadId: string;
  channel: ReviewProviderChannel;
  phone: string | null;
  email: string | null;
}) {
  const contact = getDedupeContact({ channel, phone, email });
  if (!contact) return null;

  return `review_request:${businessId}:lead:${leadId}:${channel}:${contact}`;
}

async function findDuplicateRisk(
  supabase: SupabaseServerClient,
  params: {
    businessId: string;
    leadId: string;
    channel: ReviewProviderChannel;
    dedupeKey: string;
  }
) {
  const since = new Date();
  since.setDate(since.getDate() - RECENT_DUPLICATE_WINDOW_DAYS);

  const { data, error } = await supabase
    .from("review_requests")
    .select("id, status, send_status, created_at")
    .eq("business_id", params.businessId)
    .eq("dedupe_key", params.dedupeKey)
    .gte("created_at", since.toISOString())
    .or(
      "status.in.(pending,sent,clicked,completed,duplicate_prevented),send_status.in.(not_attempted,skipped,sent,duplicate_prevented)"
    )
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return { duplicateFound: false, error: error.message };
  return { duplicateFound: Boolean(data?.length), error: null };
}

function getConfirmationCopy({
  mode,
  providerLabel,
  destinationSummary,
  channel,
  businessName,
  source,
  duplicateRisk,
}: {
  mode: ReviewSendMode;
  providerLabel: string;
  destinationSummary: string;
  channel: ReviewProviderChannel;
  businessName: string;
  source: ReviewProviderCodePath;
  duplicateRisk: DuplicateRisk;
}) {
  const channelLabel = channel === "sms" ? "SMS" : "email";
  const sourceLabel =
    source === "automation_action_manual" ? "automation-action manual approval" : "direct manual";

  if (mode === "live") {
    return {
      confirmationTitle: "Confirm live review request send",
      confirmationBody: `This will attempt to send a real review request message to ${destinationSummary} using ${providerLabel}/${channelLabel} for ${businessName}. This is a ${sourceLabel} action and will be recorded in review request history. Duplicate prevention status: ${duplicateRisk}.`,
      submitLabel: "Send live review request",
    };
  }

  if (mode === "test") {
    return {
      confirmationTitle: "Create test review request",
      confirmationBody: `Test mode is active. This may create a review request record for ${destinationSummary}, but no live provider message will be sent.`,
      submitLabel: "Create test review request",
    };
  }

  if (mode === "skip") {
    return {
      confirmationTitle: "Record skipped review request",
      confirmationBody: `Skip mode is active. This may create a review request record for ${destinationSummary}, but provider delivery will be skipped.`,
      submitLabel: "Record skipped review request",
    };
  }

  return {
    confirmationTitle: "Review request blocked",
    confirmationBody: "This request is blocked. Fix the setup or contact requirement before sending.",
    submitLabel: "Review setup",
  };
}

export async function getManualReviewSendPreflight(
  supabase: SupabaseServerClient,
  params: ManualReviewSendPreflightParams
): Promise<ManualReviewSendPreflight> {
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const missingFields: string[] = [];

  const [
    { data: businessData, error: businessError },
    { data: leadData, error: leadError },
    automationActionResult,
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, google_review_link, twilio_from_number, resend_from_email")
      .eq("id", params.businessId)
      .maybeSingle(),
    supabase
      .from("leads")
      .select("id, first_name, last_name, phone, email, opted_out")
      .eq("id", params.leadId)
      .eq("business_id", params.businessId)
      .maybeSingle(),
    params.automationActionId
      ? supabase
          .from("automation_actions")
          .select("id, business_id, lead_id, status, channel, action_type")
          .eq("id", params.automationActionId)
          .eq("business_id", params.businessId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (businessError) blockingIssues.push("Business lookup failed.");
  if (leadError) blockingIssues.push("Customer lookup failed.");
  if (automationActionResult.error) blockingIssues.push("Automation action lookup failed.");

  const business = (businessData as BusinessRow | null) ?? null;
  const lead = (leadData as LeadRow | null) ?? null;
  const automationAction = (automationActionResult.data as AutomationActionRow | null) ?? null;

  if (!business) {
    missingFields.push("Business");
    blockingIssues.push("Business not found.");
  }

  if (!lead) {
    missingFields.push("Customer");
    blockingIssues.push("Customer not found.");
  }

  if (params.automationActionId) {
    if (!automationAction) {
      blockingIssues.push("Automation action not found for this business.");
    } else {
      if (automationAction.lead_id !== params.leadId) {
        blockingIssues.push("Automation action is not connected to this customer.");
      }
      if (automationAction.status !== "pending_review") {
        blockingIssues.push("Automation action is no longer pending review.");
      }
      if (automationAction.action_type !== "review_request") {
        blockingIssues.push("Automation action is not a review request action.");
      }
    }
  }

  if (params.channel === "sms") {
    if (!lead?.phone) {
      missingFields.push("Customer phone");
      blockingIssues.push("Blocked — customer contact destination is missing.");
    }
    if (lead?.opted_out) {
      blockingIssues.push("Blocked — this customer has opted out of SMS review requests.");
    }
  }

  if (params.channel === "email" && !lead?.email) {
    missingFields.push("Customer email");
    blockingIssues.push("Blocked — customer contact destination is missing.");
  }

  const providerReadiness = getReviewProviderReadiness({
    business,
    channel: params.channel,
    codePath: params.source,
    requireReviewLink: true,
  });

  missingFields.push(...providerReadiness.missingFields);
  warnings.push(...providerReadiness.warnings);

  const dedupeKey =
    business && lead
      ? buildDedupeKey({
          businessId: business.id,
          leadId: lead.id,
          channel: params.channel,
          phone: lead.phone,
          email: lead.email,
        })
      : null;
  const duplicateCheck =
    business && lead && dedupeKey
      ? await findDuplicateRisk(supabase, {
          businessId: business.id,
          leadId: lead.id,
          channel: params.channel,
          dedupeKey,
        })
      : { duplicateFound: false, error: null };

  if (duplicateCheck.error) {
    warnings.push("Duplicate-prevention lookup could not be completed.");
  }

  const duplicateRisk: DuplicateRisk = duplicateCheck.duplicateFound
    ? "blocked"
    : duplicateCheck.error
      ? "possible"
      : "none";

  if (duplicateCheck.duplicateFound) {
    blockingIssues.push("Duplicate prevented — a recent matching request exists. No message will be sent.");
  }

  if (!providerReadiness.ready) {
    blockingIssues.push(providerReadiness.userFacingExplanation);
  }

  const uniqueBlockingIssues = Array.from(new Set(blockingIssues));
  const uniqueMissingFields = Array.from(new Set(missingFields));
  const mode = uniqueBlockingIssues.length > 0 ? "blocked" : providerReadiness.mode;
  const outcomeIfSubmitted: ManualReviewPreflightOutcome =
    duplicateRisk === "blocked"
      ? "duplicate_prevented"
      : mode === "blocked"
        ? "blocked"
        : mode === "live"
          ? "sent"
          : "not_attempted";
  const destinationSummary = getDestinationSummary(params.channel, lead);
  const businessName = business?.name ?? "this business";
  const copy = getConfirmationCopy({
    mode,
    providerLabel: providerReadiness.providerLabel,
    destinationSummary,
    channel: params.channel,
    businessName,
    source: params.source,
    duplicateRisk,
  });
  const canCreateReviewRequest = Boolean(
    business && lead && params.channel && !(params.channel === "sms" && lead.opted_out)
  );

  return {
    canCreateReviewRequest,
    canAttemptLiveSend: mode === "live" && providerReadiness.canAttemptProviderSend,
    outcomeIfSubmitted,
    mode,
    safeReason:
      uniqueBlockingIssues[0] ??
      (duplicateRisk === "possible"
        ? "Duplicate risk could not be fully verified."
        : providerReadiness.safeReason),
    warnings,
    blockingIssues: uniqueBlockingIssues,
    missingFields: uniqueMissingFields,
    confirmationRequired: mode === "live" || providerReadiness.requiresManualConfirmation,
    confirmationTitle: copy.confirmationTitle,
    confirmationBody: copy.confirmationBody,
    submitLabel: mode === "blocked" ? "Record blocked request" : copy.submitLabel,
    destinationSummary,
    providerLabel: providerReadiness.providerLabel,
    duplicateRisk,
  };
}
