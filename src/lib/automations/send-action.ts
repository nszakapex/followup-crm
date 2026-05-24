import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/messaging/send-email";
import { sendSms } from "@/lib/messaging/send-sms";
import type { DeliveryResult } from "@/lib/messaging/types";
import { getReviewProviderReadiness } from "@/lib/reviews/provider-readiness";
import { sendReviewRequest } from "@/lib/reviews/send-review-request";
import type {
  AutomationActionRecord,
  AutomationActionSendStatus,
  AutomationActionStatus,
  Business,
  Lead,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SendableAction = Pick<
  AutomationActionRecord,
  | "id"
  | "business_id"
  | "lead_id"
  | "review_request_id"
  | "action_type"
  | "status"
  | "channel"
  | "title"
  | "suggested_message"
  | "reason_code"
  | "dedupe_key"
  | "sent_at"
  | "send_status"
  | "provider_message_id"
>;

type SendLead = Pick<
  Lead,
  "id" | "first_name" | "last_name" | "phone" | "email" | "opted_out" | "status"
>;

type SendBusiness = Pick<
  Business,
  "id" | "name" | "google_review_link" | "twilio_from_number" | "resend_from_email"
>;

type ProviderReadinessSummary = {
  configured: boolean;
  skipped: boolean;
  reason: string | null;
};

export type SendAutomationActionResult =
  | {
      success: true;
      status: AutomationActionStatus;
      sendStatus: AutomationActionSendStatus;
      message: string;
      deliverySkipped: boolean;
    }
  | { success: false; error: string };

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function getDatabaseError(action: string, message: string) {
  return isDevelopment() ? `${action}: ${message}` : action;
}

function sanitizeError(error: string) {
  return error.slice(0, 500);
}

function getLeadName(lead: SendLead) {
  return `${lead.first_name} ${lead.last_name ?? ""}`.trim();
}

function normalizeProviderResult(result: DeliveryResult) {
  return {
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    providerStatus: result.providerStatus ?? null,
    deliverySkipped: Boolean(result.skipped),
    userMessage: result.userMessage,
    error: result.success ? null : result.error,
  };
}

async function logActionEvent({
  action,
  businessId,
  userId,
  actionId,
  metadata,
}: {
  action:
    | "automation_action.send_requested"
    | "automation_action.sent"
    | "automation_action.send_failed"
    | "automation_action.send_blocked";
  businessId: string;
  userId: string | null;
  actionId: string;
  metadata: Record<string, unknown>;
}) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_logs").insert({
      business_id: businessId,
      user_id: userId,
      action,
      entity_type: "automation_action",
      entity_id: actionId,
      metadata_json: metadata,
    });

    if (error) {
      console.error("[automation_action.send] Audit log failed", {
        action,
        actionId,
        businessId,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("[automation_action.send] Audit log unavailable", {
      action,
      actionId,
      businessId,
      error: error instanceof Error ? error.message : "Unknown audit error",
    });
  }
}

async function markActionFinal(
  supabase: SupabaseServerClient,
  businessId: string,
  actionId: string,
  update: {
    status: AutomationActionStatus;
    send_status: AutomationActionSendStatus;
    provider?: string | null;
    provider_message_id?: string | null;
    provider_response_json?: Record<string, unknown> | null;
    send_error?: string | null;
    review_request_id?: string | null;
    sent_at?: string | null;
  }
) {
  const { error } = await supabase
    .from("automation_actions")
    .update(update)
    .eq("id", actionId)
    .eq("business_id", businessId);

  return error;
}

async function blockAction({
  supabase,
  action,
  userId,
  reason,
  readiness,
}: {
  supabase: SupabaseServerClient;
  action: SendableAction;
  userId: string | null;
  reason: string;
  readiness?: ProviderReadinessSummary;
}) {
  const now = new Date().toISOString();
  const updateError = await markActionFinal(supabase, action.business_id, action.id, {
    status: "blocked",
    send_status: "blocked",
    send_error: reason,
    provider_response_json: readiness ? { providerReadiness: readiness } : null,
  });

  await logActionEvent({
    action: "automation_action.send_blocked",
    businessId: action.business_id,
    userId,
    actionId: action.id,
    metadata: {
      actionId: action.id,
      businessId: action.business_id,
      actionType: action.action_type,
      channel: action.channel,
      previousStatus: action.status,
      nextStatus: "blocked",
      reason: sanitizeError(reason),
      providerReadiness: readiness ?? null,
      timestamp: now,
    },
  });

  if (updateError) {
    return {
      success: false as const,
      error: getDatabaseError("Failed to update blocked automation action", updateError.message),
    };
  }

  return { success: false as const, error: reason };
}

function getReadiness(
  action: SendableAction,
  business: SendBusiness
): ProviderReadinessSummary {
  if (action.channel !== "sms" && action.channel !== "email") {
    return { configured: false, skipped: false, reason: "Automation action channel is required." };
  }

  const readiness = getReviewProviderReadiness({
    business,
    channel: action.channel,
    codePath: "automation_action_manual",
    requireReviewLink: action.action_type === "review_request",
  });

  return {
    configured: readiness.ready,
    skipped: readiness.mode === "test" || readiness.mode === "skip",
    reason: readiness.ready ? readiness.safeReason : readiness.userFacingExplanation,
  };
}

async function claimAction(
  supabase: SupabaseServerClient,
  businessId: string,
  actionId: string
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("automation_actions")
    .update({
      status: "approved_pending_send",
      send_status: "pending",
      approved_at: now,
      send_error: null,
    })
    .eq("id", actionId)
    .eq("business_id", businessId)
    .eq("status", "pending_review")
    .select("id, status")
    .maybeSingle();

  if (error || !data) {
    return {
      success: false as const,
      error: error?.message ?? "Automation action is no longer pending.",
    };
  }

  return { success: true as const };
}

async function sendFollowUpMessage({
  action,
  business,
  lead,
}: {
  action: SendableAction;
  business: SendBusiness;
  lead: SendLead;
}): Promise<DeliveryResult> {
  const body = action.suggested_message?.trim() ?? "";

  if (action.channel === "sms") {
    return sendSms({
      businessId: action.business_id,
      leadId: lead.id,
      to: lead.phone,
      body,
      optedOut: lead.opted_out,
      twilioFromNumber: business.twilio_from_number,
    });
  }

  return sendEmail({
    businessId: action.business_id,
    leadId: lead.id,
    to: lead.email,
    subject: action.title || `${business.name} follow-up`,
    body,
    fromEmail: business.resend_from_email,
  });
}

export async function sendAutomationAction(
  supabase: SupabaseServerClient,
  businessId: string,
  actionId: string,
  userId: string | null
): Promise<SendAutomationActionResult> {
  const { data: actionData, error: actionError } = await supabase
    .from("automation_actions")
    .select(
      "id, business_id, lead_id, review_request_id, action_type, status, channel, title, suggested_message, reason_code, dedupe_key, sent_at, send_status, provider_message_id"
    )
    .eq("id", actionId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (actionError || !actionData) {
    return {
      success: false,
      error: actionError?.message ?? "Automation action not found.",
    };
  }

  const action = actionData as SendableAction;

  if (action.status !== "pending_review") {
    return { success: false, error: "Only pending automation actions can be sent." };
  }

  if (action.sent_at || action.send_status === "sent") {
    return { success: false, error: "Automation action has already been sent." };
  }

  if (action.channel !== "sms" && action.channel !== "email") {
    return blockAction({
      supabase,
      action,
      userId,
      reason: "Automation action channel is required.",
    });
  }

  if (!action.lead_id) {
    return blockAction({
      supabase,
      action,
      userId,
      reason: "Automation action is not connected to a lead.",
    });
  }

  if (action.action_type !== "review_request" && action.action_type !== "follow_up_message") {
    return blockAction({
      supabase,
      action,
      userId,
      reason: "Automation action type is not sendable.",
    });
  }

  const { data: duplicateSent, error: duplicateError } = await supabase
    .from("automation_actions")
    .select("id")
    .eq("business_id", businessId)
    .eq("dedupe_key", action.dedupe_key)
    .eq("status", "sent")
    .neq("id", action.id)
    .limit(1);

  if (duplicateError) {
    return {
      success: false,
      error: getDatabaseError("Duplicate send lookup failed", duplicateError.message),
    };
  }

  if (duplicateSent && duplicateSent.length > 0) {
    return blockAction({
      supabase,
      action,
      userId,
      reason: "A matching automation action has already been sent.",
    });
  }

  const { data: businessData, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, google_review_link, twilio_from_number, resend_from_email")
    .eq("id", businessId)
    .maybeSingle();

  if (businessError || !businessData) {
    return {
      success: false,
      error: businessError?.message
        ? getDatabaseError("Business lookup failed", businessError.message)
        : "Business not found.",
    };
  }

  const business = businessData as SendBusiness;
  const { data: leadData, error: leadError } = await supabase
    .from("leads")
    .select("id, first_name, last_name, phone, email, opted_out, status")
    .eq("id", action.lead_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (leadError || !leadData) {
    return {
      success: false,
      error: leadError?.message
        ? getDatabaseError("Lead lookup failed", leadError.message)
        : "Automation action lead was not found.",
    };
  }

  const lead = leadData as SendLead;

  if (action.channel === "sms" && !lead.phone) {
    return blockAction({
      supabase,
      action,
      userId,
      reason: "Customer phone number is required.",
    });
  }

  if (action.channel === "sms" && lead.opted_out) {
    return blockAction({
      supabase,
      action,
      userId,
      reason: "This customer has opted out.",
    });
  }

  if (action.channel === "email" && !lead.email) {
    return blockAction({
      supabase,
      action,
      userId,
      reason: "Customer email is required.",
    });
  }

  if (action.action_type === "follow_up_message" && !action.suggested_message?.trim()) {
    return blockAction({
      supabase,
      action,
      userId,
      reason: "Automation action message is required.",
    });
  }

  if (action.action_type === "review_request" && !business.google_review_link) {
    return blockAction({
      supabase,
      action,
      userId,
      reason: "Review link is not configured.",
    });
  }

  const readiness = getReadiness(action, business);

  if (!readiness.configured) {
    return blockAction({
      supabase,
      action,
      userId,
      reason:
        action.channel === "sms"
          ? "SMS provider is not configured."
          : "Email provider is not configured.",
      readiness,
    });
  }

  const claim = await claimAction(supabase, businessId, action.id);

  if (!claim.success) {
    return { success: false, error: claim.error };
  }

  const requestedAt = new Date().toISOString();
  await logActionEvent({
    action: "automation_action.send_requested",
    businessId,
    userId,
    actionId: action.id,
    metadata: {
      actionId: action.id,
      businessId,
      actionType: action.action_type,
      channel: action.channel,
      previousStatus: "pending_review",
      nextStatus: "approved_pending_send",
      leadId: lead.id,
      reasonCode: action.reason_code,
      providerReadiness: readiness,
      timestamp: requestedAt,
    },
  });

  const sentAt = new Date().toISOString();
  const delivery =
    action.action_type === "review_request"
      ? await sendReviewRequest({
          businessId,
          authenticatedUserId: userId,
          resolvedUsersBusinessId: businessId,
          automationActionId: action.id,
          source: "automation_action",
          leadId: lead.id,
          customerName: getLeadName(lead),
          phone: lead.phone,
          email: lead.email,
          channel: action.channel,
          optedOut: lead.opted_out,
        })
      : await sendFollowUpMessage({ action, business, lead });

  const normalized =
    "reviewRequestId" in delivery
      ? {
          provider: delivery.provider,
          providerMessageId: delivery.providerMessageId,
          providerStatus: delivery.providerStatus ?? null,
          deliverySkipped: Boolean(delivery.deliverySkipped),
          userMessage: delivery.success
            ? delivery.message
            : delivery.blockedReason ??
              delivery.failureReason ??
              delivery.duplicateReason ??
              delivery.error ??
              "Automation action send failed.",
          error:
            delivery.success
              ? null
              : delivery.blockedReason ??
                delivery.failureReason ??
                delivery.duplicateReason ??
                delivery.error ??
                "Automation action send failed.",
          reviewRequestId: delivery.reviewRequestId,
          outcomeStatus: delivery.status,
        }
      : {
          ...normalizeProviderResult(delivery),
          reviewRequestId: null,
          outcomeStatus: delivery.success ? "sent" : "failed",
        };

  if (!delivery.success) {
    const errorMessage = normalized.error ?? "Automation action send failed.";
    const isBlockedOutcome =
      normalized.outcomeStatus === "blocked" ||
      normalized.outcomeStatus === "duplicate_prevented";
    const updateError = await markActionFinal(supabase, businessId, action.id, {
      status: isBlockedOutcome ? "blocked" : "send_failed",
      send_status: isBlockedOutcome ? "blocked" : "failed",
      provider: normalized.provider,
      provider_message_id: normalized.providerMessageId,
      review_request_id: normalized.reviewRequestId,
      provider_response_json: {
        provider: normalized.provider,
        providerMessageId: normalized.providerMessageId,
        providerStatus: normalized.providerStatus,
        deliverySkipped: normalized.deliverySkipped,
        reviewRequestId: normalized.reviewRequestId,
        userMessage: normalized.userMessage,
      },
      send_error: sanitizeError(errorMessage),
    });

    await logActionEvent({
      action: isBlockedOutcome
        ? "automation_action.send_blocked"
        : "automation_action.send_failed",
      businessId,
      userId,
      actionId: action.id,
      metadata: {
        actionId: action.id,
        businessId,
        actionType: action.action_type,
        channel: action.channel,
        previousStatus: "approved_pending_send",
        nextStatus: isBlockedOutcome ? "blocked" : "send_failed",
        leadId: lead.id,
        reviewRequestId: normalized.reviewRequestId,
        provider: normalized.provider,
        providerMessageId: normalized.providerMessageId,
        providerStatus: normalized.providerStatus,
        outcomeStatus: normalized.outcomeStatus,
        error: sanitizeError(errorMessage),
        timestamp: sentAt,
      },
    });

    if (updateError) {
      return {
        success: false,
        error: getDatabaseError("Failed to update failed automation action", updateError.message),
      };
    }

    return { success: false, error: errorMessage };
  }

  const sendStatus: AutomationActionSendStatus = normalized.deliverySkipped ? "skipped" : "sent";
  const updateError = await markActionFinal(supabase, businessId, action.id, {
    status: "sent",
    send_status: sendStatus,
    provider: normalized.provider,
    provider_message_id: normalized.providerMessageId,
    review_request_id: normalized.reviewRequestId,
    provider_response_json: {
      provider: normalized.provider,
      providerMessageId: normalized.providerMessageId,
      providerStatus: normalized.providerStatus,
      deliverySkipped: normalized.deliverySkipped,
      reviewRequestId: normalized.reviewRequestId,
      userMessage: normalized.userMessage,
    },
    send_error: null,
    sent_at: sentAt,
  });

  await logActionEvent({
    action: "automation_action.sent",
    businessId,
    userId,
    actionId: action.id,
    metadata: {
      actionId: action.id,
      businessId,
      actionType: action.action_type,
      channel: action.channel,
      previousStatus: "approved_pending_send",
      nextStatus: "sent",
      leadId: lead.id,
      reviewRequestId: normalized.reviewRequestId,
      provider: normalized.provider,
      providerMessageId: normalized.providerMessageId,
      providerStatus: normalized.providerStatus,
      deliverySkipped: normalized.deliverySkipped,
      timestamp: sentAt,
    },
  });

  if (updateError) {
    return {
      success: false,
      error: getDatabaseError("Automation action was sent but status update failed", updateError.message),
    };
  }

  return {
    success: true,
    status: "sent",
    sendStatus,
    message: normalized.deliverySkipped
      ? "Automation action approved. Delivery skipped in test mode."
      : normalized.userMessage,
    deliverySkipped: normalized.deliverySkipped,
  };
}
