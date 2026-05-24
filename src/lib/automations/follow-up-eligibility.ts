import "server-only";

import type {
  AutomationActionRecord,
  AutomationActionStatus,
  Business,
  Lead,
  MessageChannel,
  ReviewRequest,
} from "@/types/database";
import {
  getFollowUpRuleForAutomation,
  type FollowUpSequenceRule,
} from "@/lib/automations/follow-up-sequences";

const STOP_LEAD_STATUSES = new Set(["booked", "lost"]);
const ACTIVE_ACTION_STATUSES = new Set<AutomationActionStatus>([
  "pending_review",
  "approved_pending_send",
  "sent",
  "blocked",
  "send_failed",
]);
const RECENT_REVIEW_REQUEST_SEND_STATUSES = new Set([
  "not_attempted",
  "sent",
  "duplicate_prevented",
]);

type AutomationLike = {
  type: string;
  channel: MessageChannel;
  delay_hours: number | null;
  trigger_status: string | null;
};

type FollowUpEligibilityParams = {
  business: Pick<Business, "id" | "name" | "google_review_link">;
  lead: Pick<
    Lead,
    | "id"
    | "business_id"
    | "first_name"
    | "last_name"
    | "phone"
    | "email"
    | "source"
    | "status"
    | "notes"
    | "opted_out"
    | "created_at"
    | "last_contacted_at"
  >;
  automation: AutomationLike;
  existingActions: Pick<
    AutomationActionRecord,
    "id" | "status" | "dedupe_key" | "review_request_id" | "created_at"
  >[];
  reviewRequests: Pick<
    ReviewRequest,
    "id" | "status" | "send_status" | "dedupe_key" | "clicked_at" | "created_at"
  >[];
  now?: Date;
};

export type FollowUpEligibilityResult = {
  eligible: boolean;
  canQueue: boolean;
  shouldSuppress: boolean;
  actionType: string;
  queueActionType: "review_request" | "follow_up_message";
  reason: string;
  suppressReason?: string;
  blockingIssues: string[];
  warnings: string[];
  recommendedChannel: "sms" | "email" | "none";
  recommendedDelayLabel: string;
  manualApprovalRequired: true;
  duplicateKey: string | null;
  destinationSummary: string;
  providerReadinessRequiredForSend: boolean;
  nextOperatorAction: string;
  rule: FollowUpSequenceRule | null;
};

export function normalizeAutomationDestination(
  channel: MessageChannel,
  lead: Pick<Lead, "phone" | "email">
) {
  if (channel === "sms") {
    const digits = lead.phone?.replace(/\D/g, "") ?? "";
    return digits || lead.phone?.trim() || null;
  }

  if (channel === "email") {
    return lead.email?.trim().toLowerCase() || null;
  }

  return null;
}

export function getAutomationDestinationSummary(
  channel: MessageChannel | null,
  lead: Pick<Lead, "phone" | "email">
) {
  if (channel === "sms") {
    const digits = lead.phone?.replace(/\D/g, "") ?? "";
    if (digits.length >= 4) return `SMS ending in ${digits.slice(-4)}`;
    return lead.phone ? "SMS destination recorded" : "No SMS destination";
  }

  if (channel === "email") {
    const [local, domain] = lead.email?.split("@") ?? [];
    if (local && domain) return `${local.charAt(0)}${local.length > 1 ? "***" : ""}@${domain}`;
    return lead.email ? "Email destination recorded" : "No email destination";
  }

  return "No send destination";
}

export function buildAutomationActionDedupeKey({
  businessId,
  leadId,
  actionType,
  channel,
  destination,
}: {
  businessId: string;
  leadId: string;
  actionType: string;
  channel: "sms" | "email";
  destination: string;
}) {
  return `automation:${businessId}:lead:${leadId}:${actionType}:${channel}:${destination}`;
}

export function buildReviewRequestDedupeKey({
  businessId,
  leadId,
  channel,
  destination,
}: {
  businessId: string;
  leadId: string;
  channel: "sms" | "email";
  destination: string;
}) {
  return `review_request:${businessId}:lead:${leadId}:${channel}:${destination}`;
}

function isOldEnough(automation: AutomationLike, lead: FollowUpEligibilityParams["lead"], now: Date) {
  const delayHours = Number(automation.delay_hours ?? 0);
  if (delayHours <= 0) return true;

  const anchor =
    automation.type === "twenty_four_hour_followup" ||
    automation.type === "three_day_followup"
      ? lead.last_contacted_at || lead.created_at
      : lead.created_at;
  const ageMs = now.getTime() - new Date(anchor).getTime();

  return ageMs >= delayHours * 60 * 60 * 1000;
}

function leadMatchesMissedCall(lead: FollowUpEligibilityParams["lead"]) {
  const haystack = `${lead.source || ""} ${lead.notes || ""}`.toLowerCase();
  return haystack.includes("missed");
}

function hasRecentReviewRequestDuplicate(
  reviewRequests: FollowUpEligibilityParams["reviewRequests"],
  reviewRequestDedupeKey: string | null,
  rule: FollowUpSequenceRule,
  now: Date
) {
  if (!reviewRequestDedupeKey || rule.queueActionType !== "review_request") return false;

  const since = now.getTime() - rule.duplicateWindowDays * 86400000;

  return reviewRequests.some((request) => {
    if (request.dedupe_key !== reviewRequestDedupeKey) return false;
    if (new Date(request.created_at).getTime() < since) return false;
    if (request.status === "clicked" || request.status === "completed") return true;
    return request.send_status ? RECENT_REVIEW_REQUEST_SEND_STATUSES.has(request.send_status) : false;
  });
}

export function evaluateFollowUpEligibility({
  business,
  lead,
  automation,
  existingActions,
  reviewRequests,
  now = new Date(),
}: FollowUpEligibilityParams): FollowUpEligibilityResult {
  const rule = getFollowUpRuleForAutomation(automation.type);
  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (!rule) {
    return {
      eligible: false,
      canQueue: false,
      shouldSuppress: true,
      actionType: automation.type,
      queueActionType: "follow_up_message",
      reason: "Automation type is not a follow-up sequence.",
      suppressReason: "Automation type is not a follow-up sequence.",
      blockingIssues: [],
      warnings: [],
      recommendedChannel: "none",
      recommendedDelayLabel: "Not applicable",
      manualApprovalRequired: true,
      duplicateKey: null,
      destinationSummary: "No send destination",
      providerReadinessRequiredForSend: true,
      nextOperatorAction: "No action needed.",
      rule: null,
    };
  }

  const channel = automation.channel === "email" ? "email" : automation.channel === "sms" ? "sms" : null;
  const destination = channel ? normalizeAutomationDestination(channel, lead) : null;
  const destinationSummary = getAutomationDestinationSummary(channel, lead);
  const duplicateKey =
    channel && destination
      ? buildAutomationActionDedupeKey({
          businessId: business.id,
          leadId: lead.id,
          actionType: rule.actionType,
          channel,
          destination,
        })
      : null;
  const reviewRequestDedupeKey =
    channel && destination
      ? buildReviewRequestDedupeKey({
          businessId: business.id,
          leadId: lead.id,
          channel,
          destination,
        })
      : null;

  if (lead.business_id !== business.id) {
    blockingIssues.push("Lead does not belong to this business.");
  }

  if (!channel) {
    blockingIssues.push("Unsupported automation channel.");
  }

  if (channel === "sms" && lead.opted_out) {
    blockingIssues.push("This customer has opted out.");
  }

  if (channel && !destination) {
    blockingIssues.push(
      channel === "sms"
        ? "Customer phone number is required."
        : "Customer email is required."
    );
  }

  if (!rule.appliesToStatuses.includes(lead.status)) {
    blockingIssues.push(`Lead status is ${lead.status}, not eligible for this follow-up.`);
  }

  if (automation.type === "missed_call_textback" && !leadMatchesMissedCall(lead)) {
    blockingIssues.push("Lead is not marked as a missed-call lead.");
  }

  if (STOP_LEAD_STATUSES.has(lead.status) && rule.queueActionType !== "review_request") {
    blockingIssues.push("Lead has progressed or closed.");
  }

  if (rule.queueActionType === "review_request" && rule.suppressWhenReviewCompleted) {
    const completedReview = reviewRequests.some(
      (request) => request.status === "clicked" || request.status === "completed" || Boolean(request.clicked_at)
    );

    if (completedReview) {
      blockingIssues.push("Review link was already clicked or completed.");
    }

    if (!business.google_review_link) {
      warnings.push("Google review link is missing. The action can be queued only when setup is complete.");
    }
  }

  if (!isOldEnough(automation, lead, now)) {
    blockingIssues.push("Lead has not reached the recommended delay yet.");
  }

  if (
    duplicateKey &&
    existingActions.some(
      (action) => action.dedupe_key === duplicateKey && ACTIVE_ACTION_STATUSES.has(action.status)
    )
  ) {
    blockingIssues.push("A matching automation action already exists.");
  }

  if (hasRecentReviewRequestDuplicate(reviewRequests, reviewRequestDedupeKey, rule, now)) {
    blockingIssues.push("A matching recent review request already exists.");
  }

  const shouldSuppress = blockingIssues.length > 0;

  return {
    eligible: !shouldSuppress,
    canQueue: !shouldSuppress && Boolean(duplicateKey),
    shouldSuppress,
    actionType: rule.actionType,
    queueActionType: rule.queueActionType,
    reason: rule.operatorReason,
    suppressReason: shouldSuppress ? blockingIssues[0] : undefined,
    blockingIssues,
    warnings,
    recommendedChannel: channel ?? "none",
    recommendedDelayLabel: rule.recommendedDelayLabel,
    manualApprovalRequired: true,
    duplicateKey,
    destinationSummary,
    providerReadinessRequiredForSend: rule.providerReadinessRequiredForSend,
    nextOperatorAction: shouldSuppress
      ? "Resolve the listed issue before queueing this follow-up."
      : "Review and manually approve this action when ready.",
    rule,
  };
}
