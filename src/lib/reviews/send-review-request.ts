import "server-only";

import { createClient } from "@supabase/supabase-js";

import { shouldSkipReviewDelivery } from "@/lib/messaging/provider-config";
import { renderTemplate } from "@/lib/messaging/render-template";
import type { DeliveryResult } from "@/lib/messaging/types";
import { getWorkflowTemplate } from "@/lib/business-verticals/verticals";
import { sendReviewProviderMessage } from "@/lib/reviews/provider-send-adapter";
import { getReviewProviderReadiness } from "@/lib/reviews/provider-readiness";

type ReviewRequestOutcome =
  | "sent"
  | "not_attempted"
  | "blocked"
  | "failed"
  | "duplicate_prevented";
type ReviewRequestProvider =
  | "twilio"
  | "resend"
  | "test_mode"
  | "blocked"
  | "internal"
  | "none";

interface SendReviewRequestParams {
  businessId: string;
  authenticatedUserId?: string | null;
  resolvedUsersBusinessId?: string | null;
  automationActionId?: string | null;
  source?: "manual" | "automation_action" | "system";
  leadId: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  channel: "sms" | "email";
  optedOut: boolean;
}

export type SendReviewRequestResult =
  | {
      success: true;
      status: "sent" | "not_attempted";
      channel: "sms" | "email";
      provider: ReviewRequestProvider;
      reviewRequestId: string;
      automationActionId: string | null;
      leadId: string;
      businessId: string;
      providerMessageId: string | null;
      providerStatus: string | null;
      blockedReason: null;
      failureReason: null;
      duplicateReason: null;
      sentAt: string | null;
      message: string;
      deliverySkipped: boolean;
    }
  | {
      success: false;
      status: Exclude<ReviewRequestOutcome, "sent" | "not_attempted">;
      channel: "sms" | "email";
      provider: ReviewRequestProvider;
      reviewRequestId: string | null;
      automationActionId: string | null;
      leadId: string | null;
      businessId: string;
      providerMessageId: string | null;
      providerStatus: string | null;
      blockedReason: string | null;
      failureReason: string | null;
      duplicateReason: string | null;
      sentAt: null;
      error: string;
      deliverySkipped?: boolean;
    };

type ServiceClient = ReturnType<typeof createServiceClient>;
type BusinessRow = {
  id: string;
  name: string;
  industry: string | null;
  google_review_link: string | null;
  twilio_from_number: string | null;
  sms_compliance_status: string | null;
  resend_from_email: string | null;
};
type ReviewInsertStatus = "pending" | "blocked" | "failed" | "duplicate_prevented";

const DEFAULT_REVIEW_TEMPLATE =
  getWorkflowTemplate("generic_service_business", "review_request_initial");
const RECENT_DUPLICATE_WINDOW_DAYS = 7;

function createServiceClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function logReviewRequestDebug(message: string, payload: Record<string, unknown>) {
  if (!isDevelopment()) return;

  console.info(`[reviews:send] ${message}`, payload);
}

function getBusinessLookupError(businessId: string, message: string) {
  return isDevelopment()
    ? `Business not found for businessId: ${businessId || "[missing]"}. Supabase error: ${message}`
    : "Business not found.";
}

function getBusinessQueryError(businessId: string, message: string) {
  return isDevelopment()
    ? `Business lookup failed for businessId: ${businessId || "[missing]"}. Supabase error: ${message}`
    : "Business lookup failed.";
}

function getDatabaseError(action: string, message: string) {
  return isDevelopment() ? `${action}: ${message}` : action;
}

function getTrackedReviewLink(clickToken: string | null, googleReviewLink: string) {
  if (!clickToken) return googleReviewLink;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : null);

  if (!appUrl) return googleReviewLink;

  return `${appUrl.replace(/\/$/, "")}/r/${clickToken}`;
}

function sanitizeReason(reason: string) {
  return reason.slice(0, 500);
}

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
  channel: "sms" | "email";
  phone: string | null;
  email: string | null;
}) {
  return channel === "sms" ? normalizePhone(phone) : normalizeEmail(email);
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
  channel: "sms" | "email";
  phone: string | null;
  email: string | null;
}) {
  const contact = getDedupeContact({ channel, phone, email });
  if (!contact) return null;

  return `review_request:${businessId}:lead:${leadId}:${channel}:${contact}`;
}

function getNameParts(customerName: string) {
  const nameParts = customerName.trim().split(/\s+/);
  return {
    firstName: nameParts[0] || "there",
    lastName: nameParts.slice(1).join(" ") || "",
  };
}

function renderReviewBody({
  customerName,
  business,
  reviewLink,
}: {
  customerName: string;
  business: BusinessRow;
  reviewLink: string;
}) {
  const { firstName, lastName } = getNameParts(customerName);

  const template =
    getWorkflowTemplate(business.industry, "review_request_initial") ||
    DEFAULT_REVIEW_TEMPLATE;

  return renderTemplate(template, {
    first_name: firstName,
    last_name: lastName,
    business_name: business.name,
    google_review_link: reviewLink,
    firstName,
    lastName,
    businessName: business.name,
    reviewLink,
  });
}

function getProviderForChannel(channel: "sms" | "email"): ReviewRequestProvider {
  return channel === "sms" ? "twilio" : "resend";
}

async function logReviewEvent(
  supabase: ServiceClient,
  params: {
    businessId: string;
    userId?: string | null;
    action:
      | "review_request.created"
      | "review_request.sent"
      | "review_request.blocked"
      | "review_request.failed"
      | "review_request.duplicate_prevented"
      | "review_request.provider_attempted";
    entityId: string;
    metadata: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("audit_logs").insert({
    business_id: params.businessId,
    user_id: params.userId ?? null,
    action: params.action,
    entity_type: "lead",
    entity_id: params.entityId,
    metadata_json: params.metadata,
  });

  if (error && isDevelopment()) {
    console.warn("[reviews:send] Audit log failed", {
      action: params.action,
      businessId: params.businessId,
      entityId: params.entityId,
      error: error.message,
    });
  }
}

async function ensureLeadBelongsToBusiness(
  supabase: ServiceClient,
  businessId: string,
  leadId: string
) {
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("business_id", businessId)
    .maybeSingle();

  return { exists: Boolean(data), error };
}

async function findRecentDuplicate(
  supabase: ServiceClient,
  params: {
    businessId: string;
    leadId: string;
    channel: "sms" | "email";
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

  if (error) return { duplicate: null, error };
  return { duplicate: data?.[0] ?? null, error: null };
}

async function createReviewRequestRecord(
  supabase: ServiceClient,
  params: {
    businessId: string;
    leadId: string;
    customerName: string;
    phone: string | null;
    email: string | null;
    channel: "sms" | "email";
    messageBody: string;
    status: ReviewInsertStatus;
    sendStatus: "not_attempted" | "blocked" | "failed" | "duplicate_prevented";
    googleReviewUrl: string | null;
    dedupeKey: string;
    source: string;
    automationActionId: string | null;
    blockedReason?: string | null;
    failureReason?: string | null;
    duplicateReason?: string | null;
  }
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("review_requests")
    .insert({
      business_id: params.businessId,
      lead_id: params.leadId,
      customer_name: params.customerName,
      phone: params.phone || null,
      email: params.email || null,
      channel: params.channel,
      message_body: params.messageBody,
      status: params.status,
      send_status: params.sendStatus,
      google_review_url: params.googleReviewUrl,
      dedupe_key: params.dedupeKey,
      source: params.source,
      automation_action_id: params.automationActionId,
      blocked_at: params.status === "blocked" ? now : null,
      failed_at: params.status === "failed" ? now : null,
      duplicate_prevented_at: params.status === "duplicate_prevented" ? now : null,
      blocked_reason: params.blockedReason ? sanitizeReason(params.blockedReason) : null,
      failure_reason: params.failureReason ? sanitizeReason(params.failureReason) : null,
      duplicate_reason: params.duplicateReason ? sanitizeReason(params.duplicateReason) : null,
      provider: params.status === "blocked" ? "none" : null,
    })
    .select("id, click_token")
    .single();

  return { reviewRequest: data as { id: string; click_token: string | null } | null, error };
}

async function createBlockedRequest(
  supabase: ServiceClient,
  params: {
    businessId: string;
    userId?: string | null;
    leadId: string;
    customerName: string;
    phone: string | null;
    email: string | null;
    channel: "sms" | "email";
    business: BusinessRow;
    dedupeKey: string;
    source: string;
    automationActionId: string | null;
    reason: string;
  }
): Promise<SendReviewRequestResult> {
  const messageBody = params.business.google_review_link
    ? renderReviewBody({
        customerName: params.customerName,
        business: params.business,
        reviewLink: params.business.google_review_link,
      })
    : "Review request blocked before message creation.";
  const { reviewRequest, error } = await createReviewRequestRecord(supabase, {
    ...params,
    messageBody,
    status: "blocked",
    sendStatus: "blocked",
    googleReviewUrl: params.business.google_review_link,
    blockedReason: params.reason,
  });

  if (error || !reviewRequest) {
    return {
      success: false,
      status: "failed",
      channel: params.channel,
      provider: "internal",
      reviewRequestId: null,
      automationActionId: params.automationActionId,
      leadId: params.leadId,
      businessId: params.businessId,
      providerMessageId: null,
      providerStatus: null,
      blockedReason: null,
      failureReason: getDatabaseError(
        "Failed to record blocked review request",
        error?.message ?? "No review request returned."
      ),
      duplicateReason: null,
      sentAt: null,
      error: getDatabaseError(
        "Failed to record blocked review request",
        error?.message ?? "No review request returned."
      ),
    };
  }

  await logReviewEvent(supabase, {
    businessId: params.businessId,
    userId: params.userId,
    action: "review_request.blocked",
    entityId: params.leadId,
    metadata: {
      businessId: params.businessId,
      leadId: params.leadId,
      reviewRequestId: reviewRequest.id,
      automationActionId: params.automationActionId,
      channel: params.channel,
      provider: "none",
      status: "blocked",
      blockedReason: sanitizeReason(params.reason),
      source: params.source,
      timestamp: new Date().toISOString(),
    },
  });

  return {
    success: false,
    status: "blocked",
    channel: params.channel,
    provider: "none",
    reviewRequestId: reviewRequest.id,
    automationActionId: params.automationActionId,
    leadId: params.leadId,
    businessId: params.businessId,
    providerMessageId: null,
    providerStatus: null,
    blockedReason: params.reason,
    failureReason: null,
    duplicateReason: null,
    sentAt: null,
    error: params.reason,
  };
}

async function updateReviewRequestDelivery(
  supabase: ServiceClient,
  params: {
    reviewRequestId: string;
    delivery: DeliveryResult;
    deliverySkipped: boolean;
  }
) {
  const now = new Date().toISOString();

  if (params.delivery.success) {
    const { error } = await supabase
      .from("review_requests")
      .update({
        status: params.deliverySkipped ? "pending" : "sent",
        send_status: params.deliverySkipped ? "not_attempted" : "sent",
        provider: params.delivery.provider,
        provider_message_id: params.delivery.providerMessageId,
        provider_response_json: {
          provider: params.delivery.provider,
          providerMessageId: params.delivery.providerMessageId,
          providerStatus: params.delivery.providerStatus ?? null,
          deliverySkipped: params.deliverySkipped,
        },
        sent_at: params.deliverySkipped ? null : now,
        failure_reason: null,
        blocked_reason: params.deliverySkipped ? "Delivery skipped in test mode." : null,
        failed_at: null,
      })
      .eq("id", params.reviewRequestId);

    return { error, sentAt: params.deliverySkipped ? null : now };
  }

  const { error } = await supabase
    .from("review_requests")
    .update({
      status: "failed",
      send_status: "failed",
      provider: params.delivery.provider,
      provider_message_id: params.delivery.providerMessageId,
      provider_response_json: {
        provider: params.delivery.provider,
        providerMessageId: params.delivery.providerMessageId,
        providerStatus: params.delivery.providerStatus ?? null,
        userMessage: params.delivery.userMessage,
      },
      failure_reason: sanitizeReason(params.delivery.error),
      failed_at: now,
    })
    .eq("id", params.reviewRequestId);

  return { error, sentAt: null };
}

/**
 * Send a review request to a customer via SMS or email.
 *
 * The function records one clear lifecycle outcome for each attempt:
 * sent, blocked, failed, duplicate_prevented, or not_attempted in test mode.
 */
export async function sendReviewRequest(
  params: SendReviewRequestParams
): Promise<SendReviewRequestResult> {
  const {
    businessId,
    authenticatedUserId,
    resolvedUsersBusinessId,
    automationActionId = null,
    source = "manual",
    leadId,
    customerName,
    phone,
    email,
    channel,
    optedOut,
  } = params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;

  logReviewRequestDebug("service client config", {
    supabaseUrl,
    hasServiceRoleKey: Boolean(serviceRoleKey),
    serviceRoleKeyMatchesAnonKey:
      Boolean(serviceRoleKey) &&
      serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    incomingBusinessId: businessId,
    authenticatedUserId: authenticatedUserId ?? null,
    resolvedUsersBusinessId: resolvedUsersBusinessId ?? null,
  });

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      success: false,
      status: "failed",
      channel,
      provider: "internal",
      reviewRequestId: null,
      automationActionId,
      leadId,
      businessId,
      providerMessageId: null,
      providerStatus: null,
      blockedReason: null,
      failureReason: getBusinessLookupError(
        businessId,
        "Missing Supabase URL or service role key."
      ),
      duplicateReason: null,
      sentAt: null,
      error: getBusinessLookupError(
        businessId,
        "Missing Supabase URL or service role key."
      ),
    };
  }

  const supabase = createServiceClient(supabaseUrl, serviceRoleKey);
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select(
      "id, name, industry, google_review_link, twilio_from_number, sms_compliance_status, resend_from_email"
    )
    .eq("id", businessId)
    .maybeSingle();

  logReviewRequestDebug("service business lookup", {
    supabaseUrl,
    hasServiceRoleKey: Boolean(serviceRoleKey),
    serviceRoleKeyMatchesAnonKey:
      Boolean(serviceRoleKey) &&
      serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    incomingBusinessId: businessId,
    authenticatedUserId: authenticatedUserId ?? null,
    resolvedUsersBusinessId: resolvedUsersBusinessId ?? null,
    businessFound: Boolean(business),
    businessLookupError: businessError?.message ?? null,
    businessLookupCode: businessError?.code ?? null,
  });

  if (businessError) {
    return {
      success: false,
      status: "failed",
      channel,
      provider: "internal",
      reviewRequestId: null,
      automationActionId,
      leadId,
      businessId,
      providerMessageId: null,
      providerStatus: null,
      blockedReason: null,
      failureReason: getBusinessQueryError(businessId, businessError.message),
      duplicateReason: null,
      sentAt: null,
      error: getBusinessQueryError(businessId, businessError.message),
    };
  }

  if (!business) {
    return {
      success: false,
      status: "failed",
      channel,
      provider: "internal",
      reviewRequestId: null,
      automationActionId,
      leadId,
      businessId,
      providerMessageId: null,
      providerStatus: null,
      blockedReason: null,
      failureReason: getBusinessLookupError(businessId, "No matching business row returned."),
      duplicateReason: null,
      sentAt: null,
      error: getBusinessLookupError(businessId, "No matching business row returned."),
    };
  }

  const businessRow = business as BusinessRow;
  const leadCheck = await ensureLeadBelongsToBusiness(supabase, businessId, leadId);
  if (leadCheck.error || !leadCheck.exists) {
    const error = leadCheck.error
      ? getDatabaseError("Customer lookup failed", leadCheck.error.message)
      : "Customer not found.";

    return {
      success: false,
      status: "failed",
      channel,
      provider: "internal",
      reviewRequestId: null,
      automationActionId,
      leadId,
      businessId,
      providerMessageId: null,
      providerStatus: null,
      blockedReason: null,
      failureReason: error,
      duplicateReason: null,
      sentAt: null,
      error,
    };
  }

  const dedupeKey = buildDedupeKey({ businessId, leadId, channel, phone, email });
  const fallbackDedupeKey = `review_request:${businessId}:lead:${leadId}:${channel}:missing`;
  const blockParams = {
    businessId,
    userId: authenticatedUserId,
    leadId,
    customerName,
    phone,
    email,
    channel,
    business: businessRow,
    dedupeKey: dedupeKey ?? fallbackDedupeKey,
    source,
    automationActionId,
  };

  if (!businessRow.google_review_link) {
    return createBlockedRequest(supabase, {
      ...blockParams,
      reason: "Google review link is not configured. Add it in Settings.",
    });
  }

  if (channel === "sms" && !phone) {
    return createBlockedRequest(supabase, {
      ...blockParams,
      reason: "Customer phone number is required for SMS review requests.",
    });
  }

  if (channel === "sms" && optedOut) {
    return createBlockedRequest(supabase, {
      ...blockParams,
      reason: "This customer has opted out of review requests.",
    });
  }

  if (channel === "email" && !email) {
    return createBlockedRequest(supabase, {
      ...blockParams,
      reason: "Customer email is required for email review requests.",
    });
  }

  if (!dedupeKey) {
    return createBlockedRequest(supabase, {
      ...blockParams,
      reason:
        channel === "sms"
          ? "Customer phone number is required for SMS review requests."
          : "Customer email is required for email review requests.",
    });
  }

  const duplicateCheck = await findRecentDuplicate(supabase, {
    businessId,
    leadId,
    channel,
    dedupeKey,
  });

  if (duplicateCheck.error) {
    return {
      success: false,
      status: "failed",
      channel,
      provider: "internal",
      reviewRequestId: null,
      automationActionId,
      leadId,
      businessId,
      providerMessageId: null,
      providerStatus: null,
      blockedReason: null,
      failureReason: getDatabaseError("Review request duplicate lookup failed", duplicateCheck.error.message),
      duplicateReason: null,
      sentAt: null,
      error: getDatabaseError("Review request duplicate lookup failed", duplicateCheck.error.message),
    };
  }

  if (duplicateCheck.duplicate) {
    const reason = `A review request was already created for this customer and channel in the last ${RECENT_DUPLICATE_WINDOW_DAYS} days.`;
    const duplicateAttempt = await createReviewRequestRecord(supabase, {
      ...blockParams,
      messageBody: renderReviewBody({
        customerName,
        business: businessRow,
        reviewLink: businessRow.google_review_link,
      }),
      status: "duplicate_prevented",
      sendStatus: "duplicate_prevented",
      googleReviewUrl: businessRow.google_review_link,
      duplicateReason: reason,
    });

    if (duplicateAttempt.error || !duplicateAttempt.reviewRequest) {
      const error = getDatabaseError(
        "Failed to record duplicate-prevented review request",
        duplicateAttempt.error?.message ?? "No review request returned."
      );

      return {
        success: false,
        status: "failed",
        channel,
        provider: "internal",
        reviewRequestId: null,
        automationActionId,
        leadId,
        businessId,
        providerMessageId: null,
        providerStatus: null,
        blockedReason: null,
        failureReason: error,
        duplicateReason: null,
        sentAt: null,
        error,
      };
    }

    await logReviewEvent(supabase, {
      businessId,
      userId: authenticatedUserId,
      action: "review_request.duplicate_prevented",
      entityId: leadId,
      metadata: {
        businessId,
        leadId,
        reviewRequestId: duplicateAttempt.reviewRequest.id,
        existingReviewRequestId: duplicateCheck.duplicate.id,
        automationActionId,
        channel,
        provider: "none",
        status: "duplicate_prevented",
        duplicateReason: reason,
        source,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      success: false,
      status: "duplicate_prevented",
      channel,
      provider: "none",
      reviewRequestId: duplicateAttempt.reviewRequest.id,
      automationActionId,
      leadId,
      businessId,
      providerMessageId: null,
      providerStatus: null,
      blockedReason: null,
      failureReason: null,
      duplicateReason: reason,
      sentAt: null,
      error: reason,
    };
  }

  if (!shouldSkipReviewDelivery()) {
    const readiness = getReviewProviderReadiness({
      business: businessRow,
      channel,
      codePath: source === "automation_action" ? "automation_action_manual" : "direct_manual",
    });

    if (!readiness.canAttemptProviderSend) {
      return createBlockedRequest(supabase, {
        ...blockParams,
        reason:
          channel === "sms"
            ? readiness.safeReason || "SMS provider is not configured."
            : readiness.safeReason || "Email provider is not configured.",
      });
    }
  }

  const initialMessageBody = renderReviewBody({
    customerName,
    business: businessRow,
    reviewLink: businessRow.google_review_link,
  });
  const { reviewRequest, error: insertError } = await createReviewRequestRecord(supabase, {
    businessId,
    leadId,
    customerName,
    phone,
    email,
    channel,
    messageBody: initialMessageBody,
    status: "pending",
    sendStatus: "not_attempted",
    googleReviewUrl: businessRow.google_review_link,
    dedupeKey,
    source,
    automationActionId,
  });

  if (insertError || !reviewRequest) {
    return {
      success: false,
      status: "failed",
      channel,
      provider: "internal",
      reviewRequestId: null,
      automationActionId,
      leadId,
      businessId,
      providerMessageId: null,
      providerStatus: null,
      blockedReason: null,
      failureReason: getDatabaseError(
        "Failed to create review request",
        insertError?.message || "Unknown error"
      ),
      duplicateReason: null,
      sentAt: null,
      error: getDatabaseError(
        "Failed to create review request",
        insertError?.message || "Unknown error"
      ),
    };
  }

  await logReviewEvent(supabase, {
    businessId,
    userId: authenticatedUserId,
    action: "review_request.created",
    entityId: leadId,
    metadata: {
      businessId,
      leadId,
      reviewRequestId: reviewRequest.id,
      automationActionId,
      channel,
      provider: "none",
      status: "pending",
      source,
      timestamp: new Date().toISOString(),
    },
  });

  if (!reviewRequest.click_token) {
    const failureReason = "Review request click token was not generated.";
    await updateReviewRequestDelivery(supabase, {
      reviewRequestId: reviewRequest.id,
      delivery: {
        success: false,
        provider: "blocked",
        providerMessageId: null,
        providerStatus: "blocked",
        error: failureReason,
        userMessage: failureReason,
      },
      deliverySkipped: false,
    });

    return {
      success: false,
      status: "failed",
      channel,
      provider: "internal",
      reviewRequestId: reviewRequest.id,
      automationActionId,
      leadId,
      businessId,
      providerMessageId: null,
      providerStatus: null,
      blockedReason: null,
      failureReason,
      duplicateReason: null,
      sentAt: null,
      error: isDevelopment() ? failureReason : "Failed to create review request.",
    };
  }

  const reviewLink = getTrackedReviewLink(
    reviewRequest.click_token,
    businessRow.google_review_link
  );
  const messageBody = renderReviewBody({
    customerName,
    business: businessRow,
    reviewLink,
  });

  if (messageBody !== initialMessageBody) {
    const { error: messageBodyUpdateError } = await supabase
      .from("review_requests")
      .update({ message_body: messageBody })
      .eq("id", reviewRequest.id);

    if (messageBodyUpdateError) {
      return {
        success: false,
        status: "failed",
        channel,
        provider: "internal",
        reviewRequestId: reviewRequest.id,
        automationActionId,
        leadId,
        businessId,
        providerMessageId: null,
        providerStatus: null,
        blockedReason: null,
        failureReason: getDatabaseError(
          "Failed to update review request link",
          messageBodyUpdateError.message
        ),
        duplicateReason: null,
        sentAt: null,
        error: getDatabaseError(
          "Failed to update review request link",
          messageBodyUpdateError.message
        ),
      };
    }
  }

  const providerAttemptExpected = !shouldSkipReviewDelivery();
  if (providerAttemptExpected) {
    await logReviewEvent(supabase, {
      businessId,
      userId: authenticatedUserId,
      action: "review_request.provider_attempted",
      entityId: leadId,
      metadata: {
        businessId,
        leadId,
        reviewRequestId: reviewRequest.id,
        automationActionId,
        channel,
        provider: getProviderForChannel(channel),
        status: "provider_attempted",
        source,
        timestamp: new Date().toISOString(),
      },
    });
  }

  const deliveryResult = await sendReviewProviderMessage({
    businessId,
    leadId,
    channel,
    phone,
    email,
    messageBody,
    businessName: businessRow.name,
    optedOut,
    twilioFromNumber: businessRow.twilio_from_number,
    smsComplianceStatus: businessRow.sms_compliance_status,
    resendFromEmail: businessRow.resend_from_email,
  });
  const deliverySkipped = Boolean(deliveryResult.skipped);
  const updateResult = await updateReviewRequestDelivery(supabase, {
    reviewRequestId: reviewRequest.id,
    delivery: deliveryResult,
    deliverySkipped,
  });

  if (updateResult.error) {
    return {
      success: false,
      status: "failed",
      channel,
      provider: "internal",
      reviewRequestId: reviewRequest.id,
      automationActionId,
      leadId,
      businessId,
      providerMessageId: null,
      providerStatus: null,
      blockedReason: null,
      failureReason: getDatabaseError(
        "Failed to update review request status",
        updateResult.error.message
      ),
      duplicateReason: null,
      sentAt: null,
      error: getDatabaseError(
        "Failed to update review request status",
        updateResult.error.message
      ),
    };
  }

  if (!deliveryResult.success) {
    const failureReason = deliveryResult.error;
    await logReviewEvent(supabase, {
      businessId,
      userId: authenticatedUserId,
      action: "review_request.failed",
      entityId: leadId,
      metadata: {
        businessId,
        leadId,
        reviewRequestId: reviewRequest.id,
        automationActionId,
        channel,
        provider: deliveryResult.provider,
        providerMessageId: deliveryResult.providerMessageId,
        providerStatus: deliveryResult.providerStatus ?? null,
        status: "failed",
        failureReason: sanitizeReason(failureReason),
        source,
        timestamp: new Date().toISOString(),
      },
    });

    return {
      success: false,
      status: "failed",
      channel,
      provider: deliveryResult.provider,
      reviewRequestId: reviewRequest.id,
      automationActionId,
      leadId,
      businessId,
      providerMessageId: deliveryResult.providerMessageId,
      providerStatus: deliveryResult.providerStatus ?? null,
      blockedReason: null,
      failureReason,
      duplicateReason: null,
      sentAt: null,
      error: failureReason,
      deliverySkipped,
    };
  }

  await logReviewEvent(supabase, {
    businessId,
    userId: authenticatedUserId,
    action: deliverySkipped ? "review_request.blocked" : "review_request.sent",
    entityId: leadId,
    metadata: {
      businessId,
      leadId,
      reviewRequestId: reviewRequest.id,
      automationActionId,
      channel,
      provider: deliveryResult.provider,
      providerMessageId: deliveryResult.providerMessageId,
      providerStatus: deliveryResult.providerStatus ?? null,
      status: deliverySkipped ? "not_attempted" : "sent",
      blockedReason: deliverySkipped ? "Delivery skipped in test mode." : null,
      deliverySkipped,
      source,
      timestamp: new Date().toISOString(),
    },
  });

  return {
    success: true,
    status: deliverySkipped ? "not_attempted" : "sent",
    channel,
    provider: deliverySkipped ? "test_mode" : getProviderForChannel(channel),
    reviewRequestId: reviewRequest.id,
    automationActionId,
    leadId,
    businessId,
    providerMessageId: deliveryResult.providerMessageId,
    providerStatus: deliveryResult.providerStatus ?? null,
    blockedReason: null,
    failureReason: null,
    duplicateReason: null,
    sentAt: updateResult.sentAt,
    message: deliveryResult.userMessage,
    deliverySkipped,
  };
}
