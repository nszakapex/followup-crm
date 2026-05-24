import "server-only";

import type { AutomationType, LeadStatus, MessageChannel } from "@/types/database";
import type { FollowUpTemplateKey } from "@/lib/automations/follow-up-templates";

export type FollowUpSequenceActionType =
  | "review_request_initial"
  | "review_request_followup_1"
  | "review_request_followup_2"
  | "missed_call_initial"
  | "missed_call_followup_1"
  | "new_lead_initial"
  | "new_lead_followup_1"
  | "stale_lead_checkin"
  | "no_response_followup"
  | "completed_customer_review_nudge";

export type AutomationQueueActionType = "review_request" | "follow_up_message";

export type FollowUpSequenceRule = {
  automationType: AutomationType;
  actionType: FollowUpSequenceActionType;
  queueActionType: AutomationQueueActionType;
  appliesToStatuses: LeadStatus[];
  recommendedChannel: Exclude<MessageChannel, "manual_note">;
  recommendedDelayHours: number;
  recommendedDelayLabel: string;
  operatorReason: string;
  messagePurpose: string;
  manualApprovalRequired: true;
  duplicateWindowDays: number;
  reasonCode: string;
  templateKey: FollowUpTemplateKey;
  providerReadinessRequiredForQueue: boolean;
  providerReadinessRequiredForSend: boolean;
  suppressWhenReviewCompleted: boolean;
};

export const FOLLOW_UP_SEQUENCE_RULES: FollowUpSequenceRule[] = [
  {
    automationType: "review_request",
    actionType: "review_request_initial",
    queueActionType: "review_request",
    appliesToStatuses: ["completed"],
    recommendedChannel: "sms",
    recommendedDelayHours: 1,
    recommendedDelayLabel: "After the job is completed",
    operatorReason: "Lead is completed and eligible for an honest Google review request.",
    messagePurpose: "Ask for an honest review after completed service.",
    manualApprovalRequired: true,
    duplicateWindowDays: 7,
    reasonCode: "review_request",
    templateKey: "review_request_initial",
    providerReadinessRequiredForQueue: false,
    providerReadinessRequiredForSend: true,
    suppressWhenReviewCompleted: true,
  },
  {
    automationType: "missed_call_textback",
    actionType: "missed_call_initial",
    queueActionType: "follow_up_message",
    appliesToStatuses: ["new"],
    recommendedChannel: "sms",
    recommendedDelayHours: 0,
    recommendedDelayLabel: "Immediately after a missed-call lead",
    operatorReason: "Lead appears to be a missed-call new lead.",
    messagePurpose: "Acknowledge the missed call and invite a reply.",
    manualApprovalRequired: true,
    duplicateWindowDays: 7,
    reasonCode: "missed_call_textback",
    templateKey: "missed_call_initial",
    providerReadinessRequiredForQueue: false,
    providerReadinessRequiredForSend: true,
    suppressWhenReviewCompleted: false,
  },
  {
    automationType: "instant_lead_reply",
    actionType: "new_lead_initial",
    queueActionType: "follow_up_message",
    appliesToStatuses: ["new"],
    recommendedChannel: "sms",
    recommendedDelayHours: 0,
    recommendedDelayLabel: "Immediately after a new lead",
    operatorReason: "Lead is new and has not progressed yet.",
    messagePurpose: "Acknowledge the lead and ask how the business can help.",
    manualApprovalRequired: true,
    duplicateWindowDays: 7,
    reasonCode: "instant_lead_reply",
    templateKey: "new_lead_initial",
    providerReadinessRequiredForQueue: false,
    providerReadinessRequiredForSend: true,
    suppressWhenReviewCompleted: false,
  },
  {
    automationType: "twenty_four_hour_followup",
    actionType: "new_lead_followup_1",
    queueActionType: "follow_up_message",
    appliesToStatuses: ["contacted", "needs_reply"],
    recommendedChannel: "sms",
    recommendedDelayHours: 24,
    recommendedDelayLabel: "24 hours after contact",
    operatorReason: "Lead needs a polite follow-up after initial contact.",
    messagePurpose: "Check whether the customer still needs help.",
    manualApprovalRequired: true,
    duplicateWindowDays: 7,
    reasonCode: "twenty_four_hour_followup",
    templateKey: "new_lead_followup_1",
    providerReadinessRequiredForQueue: false,
    providerReadinessRequiredForSend: true,
    suppressWhenReviewCompleted: false,
  },
  {
    automationType: "three_day_followup",
    actionType: "no_response_followup",
    queueActionType: "follow_up_message",
    appliesToStatuses: ["contacted", "needs_reply"],
    recommendedChannel: "sms",
    recommendedDelayHours: 72,
    recommendedDelayLabel: "3 days after contact",
    operatorReason: "Lead has not responded after earlier contact.",
    messagePurpose: "Close the loop with one final polite check-in.",
    manualApprovalRequired: true,
    duplicateWindowDays: 14,
    reasonCode: "three_day_followup",
    templateKey: "no_response_followup",
    providerReadinessRequiredForQueue: false,
    providerReadinessRequiredForSend: true,
    suppressWhenReviewCompleted: false,
  },
];

export function getFollowUpRuleForAutomation(type: string | null | undefined) {
  return FOLLOW_UP_SEQUENCE_RULES.find((rule) => rule.automationType === type) ?? null;
}

export function getFollowUpRuleByActionType(type: string | null | undefined) {
  return FOLLOW_UP_SEQUENCE_RULES.find((rule) => rule.actionType === type) ?? null;
}

export function formatFollowUpActionType(type: string | null | undefined) {
  const rule = getFollowUpRuleByActionType(type);
  if (rule) return rule.messagePurpose;

  if (!type) return "Manual follow-up";
  return type.replaceAll("_", " ");
}
