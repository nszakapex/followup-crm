import type { MessageChannel, ReviewRequest } from "@/types/database";

export type ReviewRequestLifecycleKind =
  | "sent"
  | "blocked"
  | "failed"
  | "duplicate_prevented"
  | "not_attempted"
  | "skipped"
  | "canceled"
  | "clicked"
  | "completed"
  | "pending";

export type ReviewRequestAttentionLevel = "neutral" | "success" | "warning" | "danger";
export type ReviewRequestBadgeVariant = "default" | "secondary" | "destructive" | "outline";
export type ReviewRequestRetryMode = "none" | "new_attempt" | "same_request";

export type ReviewRequestLifecycleInput = Pick<
  ReviewRequest,
  | "status"
  | "send_status"
  | "channel"
  | "phone"
  | "email"
  | "provider"
  | "provider_message_id"
  | "sent_at"
  | "clicked_at"
  | "blocked_at"
  | "failed_at"
  | "duplicate_prevented_at"
  | "created_at"
  | "updated_at"
  | "failure_reason"
  | "blocked_reason"
  | "duplicate_reason"
>;

export type ReviewRequestLifecycleDisplay = {
  kind: ReviewRequestLifecycleKind;
  label: string;
  badgeVariant: ReviewRequestBadgeVariant;
  shortExplanation: string;
  wasAnythingSent: boolean;
  sentCopy: string;
  operatorNextAction: string;
  attentionLevel: ReviewRequestAttentionLevel;
  timestamp: string | null;
  reason: string | null;
};

export type ReviewRequestRetryEligibility = {
  canRetry: boolean;
  reason: string;
  nextActionLabel: string;
  requiresProviderReady: boolean;
  requiresManualClick: true;
  retryMode: ReviewRequestRetryMode;
};

type RetryOptions = {
  manualRetryAvailable?: boolean;
  providerReady?: boolean;
  duplicateWindowOpen?: boolean;
};

function normalizeReason(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function isTestSkipped(request: ReviewRequestLifecycleInput) {
  const reason = request.blocked_reason?.toLowerCase() ?? "";
  return (
    request.provider === "test_mode" ||
    reason.includes("test mode") ||
    reason.includes("skipped") ||
    (request.send_status === "not_attempted" && reason.includes("delivery skipped"))
  );
}

export function formatReviewRequestChannel(channel: MessageChannel | null) {
  if (channel === "sms") return "SMS";
  if (channel === "email") return "Email";
  if (channel === "manual_note") return "Manual note";
  return "Manual";
}

export function getSafeReviewRequestDestination(request: {
  channel: MessageChannel | null;
  phone: string | null;
  email: string | null;
}) {
  if (request.channel === "sms") {
    const digits = request.phone?.replace(/\D/g, "") ?? "";
    if (digits.length >= 4) return `SMS ending in ${digits.slice(-4)}`;
    return request.phone ? "SMS destination recorded" : "No SMS destination";
  }

  if (request.channel === "email") {
    const [local, domain] = request.email?.split("@") ?? [];
    if (local && domain) {
      const first = local.charAt(0);
      return `${first}${local.length > 1 ? "***" : ""}@${domain}`;
    }

    return request.email ? "Email destination recorded" : "No email destination";
  }

  return "No provider destination";
}

export function getReviewRequestLifecycle(
  request: ReviewRequestLifecycleInput
): ReviewRequestLifecycleDisplay {
  if (request.status === "clicked" || request.clicked_at) {
    return {
      kind: "clicked",
      label: "Clicked",
      badgeVariant: "default",
      shortExplanation: "Recipient opened the tracked review link.",
      wasAnythingSent: true,
      sentCopy: "A request was sent before the click was recorded.",
      operatorNextAction: "No immediate action needed.",
      attentionLevel: "success",
      timestamp: request.clicked_at ?? request.sent_at ?? request.created_at,
      reason: null,
    };
  }

  if (request.status === "completed") {
    return {
      kind: "completed",
      label: "Completed",
      badgeVariant: "default",
      shortExplanation: "Review request flow is marked complete.",
      wasAnythingSent: true,
      sentCopy: "A request was sent earlier in the lifecycle.",
      operatorNextAction: "No immediate action needed.",
      attentionLevel: "success",
      timestamp: request.clicked_at ?? request.sent_at ?? request.updated_at ?? request.created_at,
      reason: null,
    };
  }

  if (request.status === "sent" || request.send_status === "sent" || request.sent_at) {
    return {
      kind: "sent",
      label: "Sent",
      badgeVariant: "default",
      shortExplanation: "Provider accepted the request or the delivery helper completed.",
      wasAnythingSent: true,
      sentCopy: "A provider delivery path completed.",
      operatorNextAction: "Watch for a click or customer response.",
      attentionLevel: "success",
      timestamp: request.sent_at ?? request.updated_at ?? request.created_at,
      reason: null,
    };
  }

  if (request.status === "failed" || request.send_status === "failed" || request.failed_at) {
    const reason = normalizeReason(request.failure_reason);

    return {
      kind: "failed",
      label: "Failed",
      badgeVariant: "destructive",
      shortExplanation: "Provider/helper failed after the send path started.",
      wasAnythingSent: false,
      sentCopy: "The app did not record a completed provider send.",
      operatorNextAction: "Check provider setup or create a new manual request after the issue is fixed.",
      attentionLevel: "danger",
      timestamp: request.failed_at ?? request.updated_at ?? request.created_at,
      reason,
    };
  }

  if (
    request.status === "duplicate_prevented" ||
    request.send_status === "duplicate_prevented" ||
    request.duplicate_prevented_at
  ) {
    const reason = normalizeReason(request.duplicate_reason);

    return {
      kind: "duplicate_prevented",
      label: "Duplicate prevented",
      badgeVariant: "secondary",
      shortExplanation: "A recent matching request already exists.",
      wasAnythingSent: false,
      sentCopy: "No message was sent.",
      operatorNextAction: "Use the existing recent request or wait until the duplicate window passes.",
      attentionLevel: "warning",
      timestamp: request.duplicate_prevented_at ?? request.updated_at ?? request.created_at,
      reason,
    };
  }

  if (request.status === "blocked" || request.send_status === "blocked" || request.blocked_at) {
    const reason = normalizeReason(request.blocked_reason);

    return {
      kind: "blocked",
      label: "Blocked",
      badgeVariant: "secondary",
      shortExplanation:
        "No provider attempt was made because setup, safety, or contact requirements blocked delivery.",
      wasAnythingSent: false,
      sentCopy: "No message was sent.",
      operatorNextAction: "Fix the blocked setup or contact requirement before sending again.",
      attentionLevel: "warning",
      timestamp: request.blocked_at ?? request.updated_at ?? request.created_at,
      reason,
    };
  }

  if (request.status === "canceled") {
    return {
      kind: "canceled",
      label: "Canceled",
      badgeVariant: "outline",
      shortExplanation: "This review request was intentionally canceled or invalidated.",
      wasAnythingSent: false,
      sentCopy: "No active send should be assumed.",
      operatorNextAction: "Create a new manual request if the customer should be contacted.",
      attentionLevel: "neutral",
      timestamp: request.updated_at ?? request.created_at,
      reason: null,
    };
  }

  if (request.send_status === "not_attempted" && isTestSkipped(request)) {
    const reason = normalizeReason(request.blocked_reason) ?? "Delivery skipped in test mode.";

    return {
      kind: "skipped",
      label: "Test delivery",
      badgeVariant: "secondary",
      shortExplanation: "Live provider delivery was skipped by test/skip mode.",
      wasAnythingSent: false,
      sentCopy: "No live provider message was sent.",
      operatorNextAction: "Use this for QA, or disable skip/test mode before an intentional live send.",
      attentionLevel: "warning",
      timestamp: request.updated_at ?? request.created_at,
      reason,
    };
  }

  if (request.send_status === "not_attempted") {
    return {
      kind: "not_attempted",
      label: "Not attempted",
      badgeVariant: "outline",
      shortExplanation: "A request record exists but no provider delivery has been attempted.",
      wasAnythingSent: false,
      sentCopy: "No provider message was sent.",
      operatorNextAction: "Review setup and create a new manual request when ready.",
      attentionLevel: "neutral",
      timestamp: request.updated_at ?? request.created_at,
      reason: normalizeReason(request.blocked_reason),
    };
  }

  return {
    kind: "pending",
    label: "Pending",
    badgeVariant: "outline",
    shortExplanation: "A review request was created and is waiting for delivery or further action.",
    wasAnythingSent: false,
    sentCopy: "No completed provider send is recorded yet.",
    operatorNextAction: "Check the latest status before contacting this customer again.",
    attentionLevel: "neutral",
    timestamp: request.updated_at ?? request.created_at,
    reason: null,
  };
}

export function getReviewRequestRetryEligibility(
  request: ReviewRequestLifecycleInput,
  options: RetryOptions = {}
): ReviewRequestRetryEligibility {
  const lifecycle = getReviewRequestLifecycle(request);
  const manualRetryAvailable = Boolean(options.manualRetryAvailable);
  const duplicateWindowOpen = options.duplicateWindowOpen ?? true;
  const providerReady = Boolean(options.providerReady);

  if (lifecycle.kind === "sent" || lifecycle.kind === "clicked" || lifecycle.kind === "completed") {
    return {
      canRetry: false,
      reason: "This request already has a completed send/click lifecycle.",
      nextActionLabel: "No retry needed",
      requiresProviderReady: false,
      requiresManualClick: true,
      retryMode: "none",
    };
  }

  if (lifecycle.kind === "duplicate_prevented") {
    return {
      canRetry: false,
      reason:
        "Duplicate-prevented requests are not retried by default. Create a fresh manual request only after the duplicate window passes.",
      nextActionLabel: "Wait or use the existing request",
      requiresProviderReady: false,
      requiresManualClick: true,
      retryMode: "none",
    };
  }

  if (lifecycle.kind === "skipped" || lifecycle.kind === "not_attempted") {
    return {
      canRetry: false,
      reason:
        "This was not a provider failure. Use a new intentional manual request after test/skip mode and setup are correct.",
      nextActionLabel: "Create new request when ready",
      requiresProviderReady: true,
      requiresManualClick: true,
      retryMode: "none",
    };
  }

  if (lifecycle.kind === "canceled") {
    return {
      canRetry: false,
      reason: "Canceled requests are not retried. Create a new manual request if needed.",
      nextActionLabel: "Create new request if needed",
      requiresProviderReady: true,
      requiresManualClick: true,
      retryMode: "none",
    };
  }

  if (lifecycle.kind === "blocked") {
    if (!providerReady) {
      return {
        canRetry: false,
        reason: "Fix the blocked setup or contact requirement before retrying.",
        nextActionLabel: "Fix setup first",
        requiresProviderReady: true,
        requiresManualClick: true,
        retryMode: "new_attempt",
      };
    }

    return {
      canRetry: manualRetryAvailable,
      reason: manualRetryAvailable
        ? "Retry requires a fresh manual click and will re-run provider readiness and duplicate checks."
        : "Retry controls are not available from this screen yet. Create a new manual request after fixing setup.",
      nextActionLabel: manualRetryAvailable
        ? "Retry send manually"
        : "Create new manual request",
      requiresProviderReady: true,
      requiresManualClick: true,
      retryMode: manualRetryAvailable ? "new_attempt" : "none",
    };
  }

  if (lifecycle.kind === "failed") {
    if (duplicateWindowOpen) {
      return {
        canRetry: false,
        reason:
          "A new manual attempt must still pass duplicate prevention. Retry from this screen is deferred.",
        nextActionLabel: "Create new manual request if appropriate",
        requiresProviderReady: true,
        requiresManualClick: true,
        retryMode: "none",
      };
    }

    return {
      canRetry: manualRetryAvailable && providerReady,
      reason:
        manualRetryAvailable && providerReady
          ? "Retry requires a fresh manual click and will create a new attempt."
          : "Fix provider readiness and create a new manual request after the issue is resolved.",
      nextActionLabel:
        manualRetryAvailable && providerReady
          ? "Retry send manually"
          : "Create new manual request",
      requiresProviderReady: true,
      requiresManualClick: true,
      retryMode: manualRetryAvailable && providerReady ? "new_attempt" : "none",
    };
  }

  return {
    canRetry: false,
    reason: "Retry is not available for this lifecycle state.",
    nextActionLabel: "Review status",
    requiresProviderReady: true,
    requiresManualClick: true,
    retryMode: "none",
  };
}
