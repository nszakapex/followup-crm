import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  getAutomationDestinationSummary,
  normalizeAutomationDestination,
} from "@/lib/automations/follow-up-eligibility";
import {
  getReviewProviderReadiness,
  type ReviewSendMode,
} from "@/lib/reviews/provider-readiness";
import {
  getManualReviewSendPreflight,
  type DuplicateRisk,
} from "@/lib/reviews/send-preflight";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AutomationActionRow = {
  id: string;
  business_id: string;
  lead_id: string | null;
  status: string;
  channel: string | null;
  action_type: string;
  dedupe_key: string;
  suggested_message: string | null;
};

type BusinessRow = {
  id: string;
  name: string;
  google_review_link: string | null;
  twilio_from_number: string | null;
  sms_compliance_status: string | null;
  resend_from_email: string | null;
};

type LeadRow = {
  id: string;
  phone: string | null;
  email: string | null;
  opted_out: boolean;
};

export type AutomationActionSendPreflight = {
  mode: ReviewSendMode;
  submitLabel: string;
  confirmationTitle: string;
  confirmationBody: string;
  blockingIssues: string[];
  warnings: string[];
  destinationSummary: string;
  providerLabel: string;
  duplicateRisk: DuplicateRisk;
  manualApprovalRequired: true;
  nextOperatorAction: string;
};

function blockedPreflight(reason: string): AutomationActionSendPreflight {
  return {
    mode: "blocked",
    submitLabel: "Cannot send yet",
    confirmationTitle: "Automation action blocked",
    confirmationBody: reason,
    blockingIssues: [reason],
    warnings: [],
    destinationSummary: "No send destination",
    providerLabel: "Provider",
    duplicateRisk: "none",
    manualApprovalRequired: true,
    nextOperatorAction: "Fix the blocked item before approving this action.",
  };
}

function getFollowUpConfirmationCopy({
  mode,
  destinationSummary,
  providerLabel,
  channel,
}: {
  mode: ReviewSendMode;
  destinationSummary: string;
  providerLabel: string;
  channel: "sms" | "email";
}) {
  const channelLabel = channel === "sms" ? "SMS" : "email";

  if (mode === "live") {
    return {
      submitLabel: "Approve & send live",
      confirmationTitle: "Confirm live follow-up send",
      confirmationBody: `This will attempt to send one real ${channelLabel} follow-up to ${destinationSummary} using ${providerLabel}. This is a manual action and no follow-up sequence will auto-send.`,
    };
  }

  if (mode === "test") {
    return {
      submitLabel: "Create test follow-up",
      confirmationTitle: "Create test follow-up",
      confirmationBody: `Test mode is active. This may record one follow-up action for ${destinationSummary}, but no live provider message will be sent.`,
    };
  }

  if (mode === "skip") {
    return {
      submitLabel: "Record skipped follow-up",
      confirmationTitle: "Record skipped follow-up",
      confirmationBody: `Skip mode is active. This may record one handled follow-up for ${destinationSummary}, but provider delivery will be skipped.`,
    };
  }

  return {
    submitLabel: "Cannot send yet",
    confirmationTitle: "Follow-up blocked",
    confirmationBody: "This follow-up is blocked. Fix setup or contact requirements before sending.",
  };
}

async function getFollowUpDuplicateRisk(
  supabase: SupabaseServerClient,
  action: AutomationActionRow
): Promise<{ duplicateRisk: DuplicateRisk; warning: string | null }> {
  const { data, error } = await supabase
    .from("automation_actions")
    .select("id")
    .eq("business_id", action.business_id)
    .eq("dedupe_key", action.dedupe_key)
    .in("status", ["pending_review", "approved_pending_send", "sent", "blocked", "send_failed"])
    .neq("id", action.id)
    .limit(1);

  if (error) return { duplicateRisk: "possible", warning: "Duplicate-prevention lookup could not be completed." };
  return { duplicateRisk: data && data.length > 0 ? "blocked" : "none", warning: null };
}

export async function getAutomationActionSendPreflight(
  supabase: SupabaseServerClient,
  businessId: string,
  actionId: string
): Promise<AutomationActionSendPreflight> {
  const { data: actionData, error: actionError } = await supabase
    .from("automation_actions")
    .select("id, business_id, lead_id, status, channel, action_type, dedupe_key, suggested_message")
    .eq("id", actionId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (actionError) return blockedPreflight("Automation action lookup failed.");
  if (!actionData) return blockedPreflight("Automation action not found for this business.");

  const action = actionData as AutomationActionRow;

  if (!action.lead_id) return blockedPreflight("Automation action is not connected to a lead.");
  if (action.channel !== "sms" && action.channel !== "email") {
    return blockedPreflight("Automation action needs an SMS or email channel.");
  }

  if (action.action_type === "review_request") {
    const reviewPreflight = await getManualReviewSendPreflight(supabase, {
      businessId,
      leadId: action.lead_id,
      channel: action.channel,
      source: "automation_action_manual",
      automationActionId: action.id,
    });

    return {
      mode: reviewPreflight.mode,
      submitLabel: reviewPreflight.submitLabel,
      confirmationTitle: reviewPreflight.confirmationTitle,
      confirmationBody: reviewPreflight.confirmationBody,
      blockingIssues: reviewPreflight.blockingIssues,
      warnings: reviewPreflight.warnings,
      destinationSummary: reviewPreflight.destinationSummary,
      providerLabel: reviewPreflight.providerLabel,
      duplicateRisk: reviewPreflight.duplicateRisk,
      manualApprovalRequired: true,
      nextOperatorAction:
        reviewPreflight.mode === "blocked"
          ? "Resolve the blocked setup or duplicate issue before approval."
          : "Manually approve this one review request when ready.",
    };
  }

  const [
    { data: businessData, error: businessError },
    { data: leadData, error: leadError },
    duplicateLookup,
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "id, name, google_review_link, twilio_from_number, sms_compliance_status, resend_from_email"
      )
      .eq("id", businessId)
      .maybeSingle(),
    supabase
      .from("leads")
      .select("id, phone, email, opted_out")
      .eq("id", action.lead_id)
      .eq("business_id", businessId)
      .maybeSingle(),
    getFollowUpDuplicateRisk(supabase, action),
  ]);

  if (businessError) return blockedPreflight("Business lookup failed.");
  if (leadError) return blockedPreflight("Lead lookup failed.");
  if (!businessData) return blockedPreflight("Business not found.");
  if (!leadData) return blockedPreflight("Lead not found for this business.");

  const business = businessData as BusinessRow;
  const lead = leadData as LeadRow;
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const destination = normalizeAutomationDestination(action.channel, lead);
  const destinationSummary = getAutomationDestinationSummary(action.channel, lead);

  if (!destination) {
    blockingIssues.push(
      action.channel === "sms"
        ? "Customer phone number is required."
        : "Customer email is required."
    );
  }

  if (action.channel === "sms" && lead.opted_out) {
    blockingIssues.push("This customer has opted out.");
  }

  if (!action.suggested_message?.trim()) {
    blockingIssues.push("Automation action message is required.");
  }

  if (duplicateLookup.warning) warnings.push(duplicateLookup.warning);
  if (duplicateLookup.duplicateRisk === "blocked") {
    blockingIssues.push("A matching automation action already exists. No message will be sent.");
  }

  const providerReadiness = getReviewProviderReadiness({
    business,
    channel: action.channel,
    codePath: "automation_action_manual",
    requireReviewLink: false,
  });

  warnings.push(...providerReadiness.warnings);
  if (!providerReadiness.ready) blockingIssues.push(providerReadiness.userFacingExplanation);

  const mode = blockingIssues.length > 0 ? "blocked" : providerReadiness.mode;
  const copy = getFollowUpConfirmationCopy({
    mode,
    destinationSummary,
    providerLabel: providerReadiness.providerLabel,
    channel: action.channel,
  });

  return {
    mode,
    submitLabel: copy.submitLabel,
    confirmationTitle: copy.confirmationTitle,
    confirmationBody: copy.confirmationBody,
    blockingIssues: Array.from(new Set(blockingIssues)),
    warnings: Array.from(new Set(warnings)),
    destinationSummary,
    providerLabel: providerReadiness.providerLabel,
    duplicateRisk: duplicateLookup.duplicateRisk,
    manualApprovalRequired: true,
    nextOperatorAction:
      mode === "blocked"
        ? "Resolve the blocked item before approving this follow-up."
        : "Manually approve this one follow-up when ready.",
  };
}
