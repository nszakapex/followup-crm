import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  getBusinessVerticalLabel,
  normalizeBusinessVerticalId,
} from "@/lib/business-verticals/verticals";
import { DEMO_EXTERNAL_CRM_NAME } from "@/lib/demo/constants";
import { getReviewProviderReadiness, type ReviewSendMode } from "@/lib/reviews/provider-readiness";
import type {
  AutomationActionRecord,
  Business,
  Lead,
  ReviewRequest,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type BetaReadinessCheckStatus = "pass" | "warning" | "fail" | "info";

export type BetaReadinessCheck = {
  id: string;
  label: string;
  status: BetaReadinessCheckStatus;
  explanation: string;
  nextAction?: string;
};

export type BetaReadinessCounts = {
  pendingActions: number;
  blockedActions: number;
  failedActions: number;
  reviewReadyLeads: number;
  missingDestinationLeads: number;
  recentReviewRequests: number;
  duplicatePreventedRequests: number;
};

export type BetaReadinessResult = {
  readyForManualBeta: boolean;
  readyForLiveProviderTest: boolean;
  mode: ReviewSendMode;
  businessName: string;
  verticalId: string;
  verticalLabel: string;
  summary: string;
  checks: BetaReadinessCheck[];
  counts: BetaReadinessCounts;
};

type BetaBusiness = Pick<
  Business,
  | "id"
  | "name"
  | "industry"
  | "google_review_link"
  | "twilio_from_number"
  | "resend_from_email"
  | "review_requests_enabled"
  | "lead_followup_enabled"
>;

type BetaLead = Pick<
  Lead,
  "id" | "status" | "phone" | "email" | "external_crm_name" | "created_at"
>;

type BetaAction = Pick<
  AutomationActionRecord,
  | "id"
  | "status"
  | "lead_id"
  | "review_request_id"
  | "channel"
  | "dedupe_key"
  | "send_status"
  | "created_at"
>;

type BetaReviewRequest = Pick<
  ReviewRequest,
  | "id"
  | "status"
  | "send_status"
  | "lead_id"
  | "automation_action_id"
  | "duplicate_prevented_at"
  | "created_at"
>;

type BetaRunRow = {
  id: string;
  action: string;
  created_at: string;
  metadata_json: Record<string, unknown> | null;
};

function hasValue(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function isReviewLinkUrl(value: string | null | undefined) {
  if (!hasValue(value)) return false;

  try {
    const url = new URL(value as string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function addCheck(checks: BetaReadinessCheck[], check: BetaReadinessCheck) {
  checks.push(check);
}

function getMode(
  smsMode: ReviewSendMode,
  emailMode: ReviewSendMode
): ReviewSendMode {
  if (smsMode === "live" || emailMode === "live") return "live";
  if (smsMode === "test" || emailMode === "test") return "test";
  if (smsMode === "skip" || emailMode === "skip") return "skip";
  return "blocked";
}

function hasDuplicatePendingActions(actions: BetaAction[]) {
  const keys = new Set<string>();

  for (const action of actions) {
    if (action.status !== "pending_review") continue;
    if (!action.dedupe_key) continue;
    if (keys.has(action.dedupe_key)) return true;
    keys.add(action.dedupe_key);
  }

  return false;
}

function countStalePendingActions(actions: BetaAction[], reviewRequests: BetaReviewRequest[]) {
  const handledActionIds = new Set(
    reviewRequests
      .filter(
        (request) =>
          request.automation_action_id &&
          (request.status !== "pending" || request.send_status !== null)
      )
      .map((request) => request.automation_action_id as string)
  );

  return actions.filter(
    (action) =>
      action.status === "pending_review" &&
      (Boolean(action.review_request_id) || handledActionIds.has(action.id))
  ).length;
}

function getSummary({
  readyForManualBeta,
  readyForLiveProviderTest,
  mode,
  counts,
}: {
  readyForManualBeta: boolean;
  readyForLiveProviderTest: boolean;
  mode: ReviewSendMode;
  counts: BetaReadinessCounts;
}) {
  if (readyForLiveProviderTest) {
    return "Ready for a controlled one-provider live validation. Manual confirmation is still required.";
  }

  if (readyForManualBeta) {
    return mode === "blocked"
      ? "Ready for manual beta review, but live provider sending is blocked until setup is complete."
      : "Ready for manual beta QA in safe test/skip mode. No live provider message is required.";
  }

  if (counts.pendingActions > 0) {
    return "Queue data exists, but setup or integrity checks still need attention before beta use.";
  }

  return "Complete setup and seed/test data before using this workspace for beta QA.";
}

export async function getBetaReadiness(
  supabase: SupabaseServerClient,
  businessId: string
): Promise<BetaReadinessResult> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const [businessResult, leadsResult, actionsResult, reviewRequestsResult, runHistoryResult] =
    await Promise.all([
      supabase
        .from("businesses")
        .select(
          "id, name, industry, google_review_link, twilio_from_number, resend_from_email, review_requests_enabled, lead_followup_enabled"
        )
        .eq("id", businessId)
        .maybeSingle(),
      supabase
        .from("leads")
        .select("id, status, phone, email, external_crm_name, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("automation_actions")
        .select("id, status, lead_id, review_request_id, channel, dedupe_key, send_status, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("review_requests")
        .select("id, status, send_status, lead_id, automation_action_id, duplicate_prevented_at, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("audit_logs")
        .select("id, action, created_at, metadata_json")
        .eq("business_id", businessId)
        .in("action", ["automation_run.completed", "automation_run.failed"])
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  const business = (businessResult.data ?? null) as BetaBusiness | null;
  const leads = (leadsResult.data ?? []) as BetaLead[];
  const actions = (actionsResult.data ?? []) as BetaAction[];
  const reviewRequests = (reviewRequestsResult.data ?? []) as BetaReviewRequest[];
  const latestRun = ((runHistoryResult.data ?? []) as BetaRunRow[])[0] ?? null;
  const verticalId = normalizeBusinessVerticalId(business?.industry ?? null);
  const verticalLabel = getBusinessVerticalLabel(business?.industry ?? null);
  const smsReadiness = getReviewProviderReadiness({
    business,
    channel: "sms",
    codePath: "direct_manual",
  });
  const emailReadiness = getReviewProviderReadiness({
    business,
    channel: "email",
    codePath: "direct_manual",
  });
  const mode = getMode(smsReadiness.mode, emailReadiness.mode);
  const recentReviewRequests = reviewRequests.filter(
    (request) => new Date(request.created_at).toISOString() >= since
  );
  const counts: BetaReadinessCounts = {
    pendingActions: actions.filter((action) => action.status === "pending_review").length,
    blockedActions: actions.filter((action) => action.status === "blocked").length,
    failedActions: actions.filter((action) => action.status === "send_failed").length,
    reviewReadyLeads: leads.filter((lead) => lead.status === "completed").length,
    missingDestinationLeads: leads.filter((lead) => !hasValue(lead.phone) && !hasValue(lead.email)).length,
    recentReviewRequests: recentReviewRequests.length,
    duplicatePreventedRequests: reviewRequests.filter(
      (request) =>
        request.status === "duplicate_prevented" ||
        request.send_status === "duplicate_prevented" ||
        request.duplicate_prevented_at
    ).length,
  };
  const stalePendingActions = countStalePendingActions(actions, reviewRequests);
  const duplicatePendingActions = hasDuplicatePendingActions(actions);
  const demoDataDetected = leads.some((lead) => lead.external_crm_name === DEMO_EXTERNAL_CRM_NAME);
  const checks: BetaReadinessCheck[] = [];

  addCheck(checks, {
    id: "business_exists",
    label: "Business workspace",
    status: business ? "pass" : "fail",
    explanation: business
      ? `${business.name} is available for this session.`
      : "The business row could not be loaded.",
    nextAction: business ? undefined : "Confirm the signed-in user has a valid business_id.",
  });

  addCheck(checks, {
    id: "business_name",
    label: "Business name",
    status: hasValue(business?.name) ? "pass" : "fail",
    explanation: hasValue(business?.name)
      ? "The workspace has a visible business name."
      : "A business name is required before beta operators can trust records.",
    nextAction: hasValue(business?.name) ? undefined : "Add a business name in Settings.",
  });

  addCheck(checks, {
    id: "vertical_resolved",
    label: "Workflow type",
    status: verticalId === "generic_service_business" && hasValue(business?.industry) ? "warning" : "pass",
    explanation: `${verticalLabel} workflow templates are resolved. Unknown types fall back to generic service-business copy.`,
    nextAction:
      verticalId === "generic_service_business" && hasValue(business?.industry)
        ? "Review the business type if a beta vertical should be selected."
        : undefined,
  });

  addCheck(checks, {
    id: "review_link",
    label: "Google review link",
    status: isReviewLinkUrl(business?.google_review_link)
      ? "pass"
      : hasValue(business?.google_review_link)
        ? "warning"
        : "fail",
    explanation: isReviewLinkUrl(business?.google_review_link)
      ? "A review destination URL is configured."
      : hasValue(business?.google_review_link)
        ? "A review link exists, but it does not look like a valid http/https URL."
        : "Review request actions need a Google review destination before live sending.",
    nextAction: isReviewLinkUrl(business?.google_review_link)
      ? undefined
      : "Add or correct the Google review link in Settings.",
  });

  addCheck(checks, {
    id: "provider_mode",
    label: "Provider safety mode",
    status: mode === "live" ? "warning" : mode === "blocked" ? "warning" : "pass",
    explanation:
      mode === "live"
        ? "Live mode is available. Manual sends can attempt real delivery only after confirmation."
        : mode === "blocked"
          ? "Provider sending is blocked by setup/readiness. No live message can be sent."
          : `${mode === "skip" ? "Skip" : "Test"} mode is active. No live provider message will be sent.`,
    nextAction:
      mode === "live"
        ? "Use exactly one manual validation send when ready."
        : "Keep test/skip mode for beta QA until provider configuration is intentional.",
  });

  addCheck(checks, {
    id: "manual_live_send",
    label: "Manual live sending",
    status:
      smsReadiness.canAttemptProviderSend || emailReadiness.canAttemptProviderSend
        ? "warning"
        : "info",
    explanation:
      smsReadiness.canAttemptProviderSend || emailReadiness.canAttemptProviderSend
        ? "At least one provider path is live-ready; manual confirmation is still required."
        : "Manual live sending is unavailable or test/skip mode is active.",
    nextAction:
      smsReadiness.canAttemptProviderSend || emailReadiness.canAttemptProviderSend
        ? "Validate with one real test contact only."
        : "Finish setup before any controlled live provider validation.",
  });

  addCheck(checks, {
    id: "lead_data",
    label: "Lead/test data",
    status: leads.length > 0 ? "pass" : "fail",
    explanation:
      leads.length > 0
        ? `${leads.length} lead/customer records are available.`
        : "No leads are available for beta testing.",
    nextAction: leads.length > 0 ? undefined : "Seed demo data or add one test-safe lead.",
  });

  addCheck(checks, {
    id: "review_ready_leads",
    label: "Review-ready completed leads",
    status: counts.reviewReadyLeads > 0 ? "pass" : "warning",
    explanation:
      counts.reviewReadyLeads > 0
        ? `${counts.reviewReadyLeads} completed lead(s) can be used to test review request planning.`
        : "No completed leads are available for review-request QA.",
    nextAction: counts.reviewReadyLeads > 0 ? undefined : "Add or seed a completed customer.",
  });

  addCheck(checks, {
    id: "missing_destinations",
    label: "Missing destination fixtures",
    status: counts.missingDestinationLeads > 0 ? "info" : "warning",
    explanation:
      counts.missingDestinationLeads > 0
        ? `${counts.missingDestinationLeads} lead(s) intentionally lack phone/email for blocked-state testing.`
        : "No lead currently tests missing-destination blocking.",
    nextAction:
      counts.missingDestinationLeads > 0
        ? undefined
        : "Seed or add one fake lead without phone/email before beta QA.",
  });

  addCheck(checks, {
    id: "pending_actions",
    label: "Pending action queue",
    status: counts.pendingActions > 0 ? "pass" : "info",
    explanation:
      counts.pendingActions > 0
        ? `${counts.pendingActions} pending manual action(s) are visible for operator QA.`
        : "No pending automation actions are currently queued.",
    nextAction:
      counts.pendingActions > 0
        ? undefined
        : "Run a confirmed automation check in test mode if queue testing is needed.",
  });

  addCheck(checks, {
    id: "blocked_failed_actions",
    label: "Blocked/failed action visibility",
    status: counts.blockedActions + counts.failedActions > 0 ? "warning" : "pass",
    explanation:
      counts.blockedActions + counts.failedActions > 0
        ? `${counts.blockedActions} blocked and ${counts.failedActions} failed action(s) need review.`
        : "No blocked or failed automation actions are currently recorded.",
    nextAction:
      counts.blockedActions + counts.failedActions > 0
        ? "Review recent action outcomes before beta use."
        : undefined,
  });

  addCheck(checks, {
    id: "duplicate_requests",
    label: "Duplicate prevention visibility",
    status: counts.duplicatePreventedRequests > 0 ? "info" : "pass",
    explanation:
      counts.duplicatePreventedRequests > 0
        ? `${counts.duplicatePreventedRequests} duplicate-prevented review request(s) are recorded.`
        : "No duplicate-prevented review requests are currently recorded.",
  });

  addCheck(checks, {
    id: "action_idempotency",
    label: "Action idempotency",
    status: duplicatePendingActions || stalePendingActions > 0 ? "fail" : "pass",
    explanation:
      duplicatePendingActions || stalePendingActions > 0
        ? "Duplicate or stale pending actions were detected."
        : "No duplicate pending actions or stale handled pending actions were detected.",
    nextAction:
      duplicatePendingActions || stalePendingActions > 0
        ? "Run diagnostics and reconcile stale actions before beta use."
        : undefined,
  });

  addCheck(checks, {
    id: "automation_run_history",
    label: "Automation run history",
    status: latestRun ? (latestRun.action === "automation_run.failed" ? "warning" : "pass") : "info",
    explanation: latestRun
      ? `Latest automation run event: ${latestRun.action.replaceAll("_", " ")}.`
      : "No automation run has been recorded yet.",
    nextAction: latestRun ? undefined : "Run a dry-run or confirmed check before beta QA.",
  });

  addCheck(checks, {
    id: "demo_beta_data",
    label: "Demo/beta fixtures",
    status: demoDataDetected ? "pass" : "info",
    explanation: demoDataDetected
      ? "Detailing beta demo records are detected."
      : "No demo seed markers are detected for this business.",
    nextAction: demoDataDetected ? undefined : "Seed demo data only if this is a beta test workspace.",
  });

  const failCount = checks.filter((check) => check.status === "fail").length;
  const readyForManualBeta =
    Boolean(business) &&
    hasValue(business?.name) &&
    leads.length > 0 &&
    failCount === 0 &&
    !duplicatePendingActions &&
    stalePendingActions === 0;
  const readyForLiveProviderTest =
    readyForManualBeta &&
    isReviewLinkUrl(business?.google_review_link) &&
    (smsReadiness.canAttemptProviderSend || emailReadiness.canAttemptProviderSend);

  return {
    readyForManualBeta,
    readyForLiveProviderTest,
    mode,
    businessName: business?.name ?? "Unknown business",
    verticalId,
    verticalLabel,
    summary: getSummary({ readyForManualBeta, readyForLiveProviderTest, mode, counts }),
    checks,
    counts,
  };
}
