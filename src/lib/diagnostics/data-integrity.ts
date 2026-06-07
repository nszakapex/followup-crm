import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type {
  AutomationActionRecord,
  Lead,
  ReviewRequest,
  ReviewRequestSendStatus,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type DataIntegrityStatus = "healthy" | "warning" | "critical";
export type DataIntegritySeverity = "info" | "warning" | "critical";

export type DataIntegrityFinding = {
  id: string;
  severity: DataIntegritySeverity;
  title: string;
  explanation: string;
  affectedCount: number;
  sampleIds: string[];
  recommendedFix: string;
};

export type DataIntegrityResult = {
  status: DataIntegrityStatus;
  findings: DataIntegrityFinding[];
};

type IntegrityAction = Pick<
  AutomationActionRecord,
  | "id"
  | "business_id"
  | "lead_id"
  | "review_request_id"
  | "status"
  | "channel"
  | "dedupe_key"
  | "send_status"
  | "sent_at"
  | "provider"
  | "provider_message_id"
  | "provider_response_json"
  | "send_error"
>;

type IntegrityReviewRequest = Pick<
  ReviewRequest,
  | "id"
  | "business_id"
  | "lead_id"
  | "automation_action_id"
  | "status"
  | "send_status"
  | "channel"
  | "phone"
  | "email"
  | "provider"
  | "provider_message_id"
  | "provider_response_json"
  | "sent_at"
  | "blocked_at"
  | "failed_at"
  | "duplicate_prevented_at"
  | "blocked_reason"
  | "failure_reason"
  | "duplicate_reason"
  | "dedupe_key"
  | "created_at"
>;

type IntegrityLead = Pick<Lead, "id" | "business_id" | "phone" | "email" | "opted_out" | "status">;

const HANDLED_REVIEW_SEND_STATUSES: Array<ReviewRequestSendStatus | null> = [
  "not_attempted",
  "blocked",
  "sent",
  "failed",
  "duplicate_prevented",
];

function sampleIds(ids: string[]) {
  return Array.from(new Set(ids)).slice(0, 5);
}

function addFinding(
  findings: DataIntegrityFinding[],
  finding: Omit<DataIntegrityFinding, "affectedCount" | "sampleIds"> & {
    affectedIds: string[];
  }
) {
  if (finding.affectedIds.length === 0) return;

  findings.push({
    id: finding.id,
    severity: finding.severity,
    title: finding.title,
    explanation: finding.explanation,
    affectedCount: finding.affectedIds.length,
    sampleIds: sampleIds(finding.affectedIds),
    recommendedFix: finding.recommendedFix,
  });
}

function isReviewRequestHandled(request: IntegrityReviewRequest) {
  return (
    request.status !== "pending" ||
    HANDLED_REVIEW_SEND_STATUSES.includes(request.send_status)
  );
}

function needsDestination(action: IntegrityAction) {
  return action.status === "pending_review" && (action.channel === "sms" || action.channel === "email");
}

function hasRequiredDestination(action: IntegrityAction, lead: IntegrityLead | undefined) {
  if (action.channel === "sms") return Boolean(lead?.phone?.trim());
  if (action.channel === "email") return Boolean(lead?.email?.trim());
  return true;
}

function groupDuplicateIds<T extends { id: string }>(
  items: T[],
  getKey: (item: T) => string | null | undefined
) {
  const groups = new Map<string, string[]>();

  for (const item of items) {
    const key = getKey(item)?.trim();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item.id]);
  }

  return Array.from(groups.values())
    .filter((ids) => ids.length > 1)
    .flat();
}

function containsSuspiciousSecret(value: unknown): boolean {
  if (value == null) return false;

  if (typeof value === "string") {
    const text = value.toLowerCase();
    return (
      text.includes("authorization") ||
      text.includes("bearer ") ||
      text.includes("api_key") ||
      text.includes("apikey") ||
      text.includes("auth_token") ||
      text.includes("secret") ||
      text.includes("twilio_auth") ||
      text.includes("resend_api") ||
      text.includes("telnyx_api") ||
      text.includes("plivo_auth")
    );
  }

  if (Array.isArray(value)) return value.some(containsSuspiciousSecret);

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nestedValue]) => containsSuspiciousSecret(key) || containsSuspiciousSecret(nestedValue)
    );
  }

  return false;
}

function looksLikeRawFailureText(value: string | null) {
  if (!value) return false;
  const text = value.toLowerCase();
  return (
    text.includes("stack trace") ||
    text.includes(" at ") ||
    text.includes("node_modules") ||
    text.includes("authorization") ||
    text.includes("bearer ") ||
    text.includes("api key") ||
    text.includes("auth token") ||
    text.includes("twilio_auth_token") ||
    text.includes("resend_api_key") ||
    text.includes("telnyx_api_key") ||
    text.includes("plivo_auth_token")
  );
}

function hasLifecycleReason(request: IntegrityReviewRequest) {
  if (request.status === "failed" || request.send_status === "failed" || request.failed_at) {
    return Boolean(request.failure_reason?.trim());
  }

  if (request.status === "blocked" || request.send_status === "blocked" || request.blocked_at) {
    return Boolean(request.blocked_reason?.trim());
  }

  if (
    request.status === "duplicate_prevented" ||
    request.send_status === "duplicate_prevented" ||
    request.duplicate_prevented_at
  ) {
    return Boolean(request.duplicate_reason?.trim());
  }

  return true;
}

function activeReviewRequestDedupeKey(request: IntegrityReviewRequest) {
  if (!request.dedupe_key) return null;
  if (request.status === "canceled") return null;
  return request.dedupe_key;
}

function legacyDedupeIds(actions: IntegrityAction[]) {
  return actions
    .filter((action) => {
      if (!action.dedupe_key) return false;
      if (action.channel === "sms") return !action.dedupe_key.includes(":sms:");
      if (action.channel === "email") return !action.dedupe_key.includes(":email:");
      return false;
    })
    .map((action) => action.id);
}

function getStatus(findings: DataIntegrityFinding[]): DataIntegrityStatus {
  if (findings.some((finding) => finding.severity === "critical")) return "critical";
  if (findings.some((finding) => finding.severity === "warning")) return "warning";
  return "healthy";
}

export async function getBusinessDataIntegrity(
  supabase: SupabaseServerClient,
  businessId: string
): Promise<DataIntegrityResult> {
  const [actionsResult, reviewRequestsResult, leadsResult, businessResult] = await Promise.all([
    supabase
      .from("automation_actions")
      .select(
        "id, business_id, lead_id, review_request_id, status, channel, dedupe_key, send_status, sent_at, provider, provider_message_id, provider_response_json, send_error"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("review_requests")
      .select(
        "id, business_id, lead_id, automation_action_id, status, send_status, channel, phone, email, provider, provider_message_id, provider_response_json, sent_at, blocked_at, failed_at, duplicate_prevented_at, blocked_reason, failure_reason, duplicate_reason, dedupe_key, created_at"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("leads")
      .select("id, business_id, phone, email, opted_out, status")
      .eq("business_id", businessId)
      .limit(1000),
    supabase.from("businesses").select("id").eq("id", businessId).maybeSingle(),
  ]);

  const findings: DataIntegrityFinding[] = [];

  if (businessResult.error || !businessResult.data) {
    addFinding(findings, {
      id: "business_missing",
      severity: "critical",
      title: "Business record is unavailable",
      explanation: "The current workspace could not load its business row.",
      affectedIds: [businessId],
      recommendedFix: "Verify the authenticated user's business_id and the businesses table.",
    });
  }

  for (const [id, error] of [
    ["automation_actions_query", actionsResult.error],
    ["review_requests_query", reviewRequestsResult.error],
    ["leads_query", leadsResult.error],
  ] as const) {
    if (error) {
      addFinding(findings, {
        id,
        severity: "critical",
        title: "Diagnostic query failed",
        explanation: "A read-only diagnostic query failed, so integrity status may be incomplete.",
        affectedIds: [businessId],
        recommendedFix: error.message,
      });
    }
  }

  const actions = ((actionsResult.data ?? []) as IntegrityAction[]).filter(
    (action) => action.business_id === businessId
  );
  const reviewRequests = ((reviewRequestsResult.data ?? []) as IntegrityReviewRequest[]).filter(
    (request) => request.business_id === businessId
  );
  const leads = ((leadsResult.data ?? []) as IntegrityLead[]).filter(
    (lead) => lead.business_id === businessId
  );
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const actionsById = new Map(actions.map((action) => [action.id, action]));
  const reviewRequestsByActionId = new Map<string, IntegrityReviewRequest[]>();

  for (const request of reviewRequests) {
    if (!request.automation_action_id) continue;
    reviewRequestsByActionId.set(request.automation_action_id, [
      ...(reviewRequestsByActionId.get(request.automation_action_id) ?? []),
      request,
    ]);
  }

  addFinding(findings, {
    id: "automation_actions_missing_lead",
    severity: "warning",
    title: "Automation actions link to missing leads",
    explanation: "Some actions point at lead records that are not available in this business.",
    affectedIds: actions
      .filter((action) => action.lead_id && !leadsById.has(action.lead_id))
      .map((action) => action.id),
    recommendedFix: "Reset stale demo data or reconcile/delete orphaned action records.",
  });

  addFinding(findings, {
    id: "review_requests_missing_lead",
    severity: "warning",
    title: "Review requests link to missing leads",
    explanation: "Some review request rows point at lead records that are not available in this business.",
    affectedIds: reviewRequests
      .filter((request) => request.lead_id && !leadsById.has(request.lead_id))
      .map((request) => request.id),
    recommendedFix: "Check whether the lead was deleted and reconcile the review request history.",
  });

  addFinding(findings, {
    id: "review_requests_missing_action",
    severity: "warning",
    title: "Review requests link to missing automation actions",
    explanation:
      "Some review requests reference automation_action_id values that are not present in this business.",
    affectedIds: reviewRequests
      .filter((request) => request.automation_action_id && !actionsById.has(request.automation_action_id))
      .map((request) => request.id),
    recommendedFix: "Verify action linkage before relying on automation action history.",
  });

  addFinding(findings, {
    id: "pending_action_has_handled_review_request",
    severity: "warning",
    title: "Pending actions already have handled review requests",
    explanation:
      "Some pending actions are linked to review request outcomes and should not remain actively sendable.",
    affectedIds: actions
      .filter((action) => {
        if (action.status !== "pending_review") return false;
        if (action.review_request_id) return true;
        return (reviewRequestsByActionId.get(action.id) ?? []).some(isReviewRequestHandled);
      })
      .map((action) => action.id),
    recommendedFix: "Open the action queue and let the server reconcile, or repair the stale action state.",
  });

  addFinding(findings, {
    id: "duplicate_pending_actions",
    severity: "warning",
    title: "Duplicate pending automation actions",
    explanation: "More than one pending action shares the same dedupe identity.",
    affectedIds: groupDuplicateIds(
      actions.filter((action) => action.status === "pending_review"),
      (action) => action.dedupe_key
    ),
    recommendedFix: "Review queue idempotency and keep only one active pending action per dedupe key.",
  });

  addFinding(findings, {
    id: "duplicate_review_request_dedupe",
    severity: "warning",
    title: "Duplicate active review request identities",
    explanation: "Recent review request rows share a destination-aware dedupe key.",
    affectedIds: groupDuplicateIds(reviewRequests, activeReviewRequestDedupeKey),
    recommendedFix: "Confirm duplicate-prevention outcomes and avoid repeated active attempts for the same destination.",
  });

  addFinding(findings, {
    id: "review_sent_without_sent_at",
    severity: "warning",
    title: "Sent review requests missing sent_at",
    explanation: "A sent lifecycle should have a sent_at timestamp.",
    affectedIds: reviewRequests
      .filter((request) => request.send_status === "sent" && !request.sent_at)
      .map((request) => request.id),
    recommendedFix: "Backfill sent_at from created_at or provider metadata if this is confirmed sent.",
  });

  addFinding(findings, {
    id: "review_sent_at_status_mismatch",
    severity: "warning",
    title: "sent_at does not match send_status",
    explanation: "A review request has sent_at populated but send_status is not sent.",
    affectedIds: reviewRequests
      .filter((request) => request.sent_at && request.send_status !== "sent")
      .map((request) => request.id),
    recommendedFix: "Reconcile lifecycle fields so UI and duplicate logic agree.",
  });

  addFinding(findings, {
    id: "review_duplicate_missing_timestamp",
    severity: "warning",
    title: "Duplicate-prevented requests missing timestamp",
    explanation: "Duplicate-prevented lifecycle rows should record duplicate_prevented_at.",
    affectedIds: reviewRequests
      .filter(
        (request) =>
          (request.status === "duplicate_prevented" ||
            request.send_status === "duplicate_prevented") &&
          !request.duplicate_prevented_at
      )
      .map((request) => request.id),
    recommendedFix: "Backfill duplicate_prevented_at or recreate the lifecycle record through the safe send path.",
  });

  addFinding(findings, {
    id: "review_failed_missing_timestamp",
    severity: "warning",
    title: "Failed requests missing timestamp",
    explanation: "Failed lifecycle rows should record failed_at.",
    affectedIds: reviewRequests
      .filter(
        (request) =>
          (request.status === "failed" || request.send_status === "failed") && !request.failed_at
      )
      .map((request) => request.id),
    recommendedFix: "Backfill failed_at or verify the failure lifecycle path.",
  });

  addFinding(findings, {
    id: "review_blocked_missing_timestamp",
    severity: "warning",
    title: "Blocked requests missing timestamp",
    explanation: "Blocked lifecycle rows should record blocked_at.",
    affectedIds: reviewRequests
      .filter(
        (request) =>
          (request.status === "blocked" || request.send_status === "blocked") && !request.blocked_at
      )
      .map((request) => request.id),
    recommendedFix: "Backfill blocked_at or verify the blocked lifecycle path.",
  });

  addFinding(findings, {
    id: "provider_message_without_provider",
    severity: "warning",
    title: "Provider message IDs missing provider labels",
    explanation: "Provider message identifiers should be paired with a safe provider label.",
    affectedIds: reviewRequests
      .filter((request) => request.provider_message_id && !request.provider)
      .map((request) => request.id),
    recommendedFix: "Record a safe provider label for provider_message_id rows.",
  });

  addFinding(findings, {
    id: "provider_message_status_mismatch",
    severity: "warning",
    title: "Provider message IDs on unsent requests",
    explanation: "Provider message IDs should generally appear only on sent lifecycle rows.",
    affectedIds: reviewRequests
      .filter((request) => request.provider_message_id && request.send_status !== "sent")
      .map((request) => request.id),
    recommendedFix: "Confirm whether the provider ID is safe metadata or reconcile send_status.",
  });

  addFinding(findings, {
    id: "provider_response_may_contain_secret",
    severity: "critical",
    title: "Provider response metadata may contain secret-like text",
    explanation: "provider_response_json should store safe metadata only, never tokens or raw provider payloads.",
    affectedIds: reviewRequests
      .filter((request) => containsSuspiciousSecret(request.provider_response_json))
      .map((request) => request.id),
    recommendedFix: "Remove unsafe provider_response_json values and keep raw provider details server-side only.",
  });

  addFinding(findings, {
    id: "unsafe_failure_text",
    severity: "critical",
    title: "Failure text may expose raw provider/internal details",
    explanation: "Operator-facing failure reasons should be sanitized.",
    affectedIds: reviewRequests
      .filter((request) => looksLikeRawFailureText(request.failure_reason))
      .map((request) => request.id),
    recommendedFix: "Replace raw failure text with a safe reason such as Provider failed to send the message.",
  });

  addFinding(findings, {
    id: "missing_lifecycle_reason",
    severity: "warning",
    title: "Lifecycle rows missing safe reasons",
    explanation: "Blocked, failed, and duplicate-prevented outcomes should include a safe operator reason.",
    affectedIds: reviewRequests.filter((request) => !hasLifecycleReason(request)).map((request) => request.id),
    recommendedFix: "Backfill safe blocked/failure/duplicate reasons for operator clarity.",
  });

  addFinding(findings, {
    id: "sendable_action_missing_destination",
    severity: "warning",
    title: "Send-capable actions missing destinations",
    explanation: "Pending SMS/email actions should not be actively sendable without the required lead destination.",
    affectedIds: actions
      .filter((action) => needsDestination(action) && !hasRequiredDestination(action, leadsById.get(action.lead_id ?? "")))
      .map((action) => action.id),
    recommendedFix: "Add the missing phone/email or let the send preflight block the action safely.",
  });

  addFinding(findings, {
    id: "legacy_action_dedupe_key",
    severity: "info",
    title: "Legacy-style automation action dedupe keys found",
    explanation: "Some action dedupe keys do not clearly include channel identity. They may still be protected, but are worth reviewing.",
    affectedIds: legacyDedupeIds(actions),
    recommendedFix: "Allow new queue generation to use destination-aware dedupe keys and retire stale legacy actions when safe.",
  });

  return {
    status: getStatus(findings),
    findings,
  };
}
