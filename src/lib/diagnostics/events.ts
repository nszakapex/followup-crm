import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  getReviewRequestLifecycle,
  getSafeReviewRequestDestination,
} from "@/lib/reviews/lifecycle";
import type {
  AutomationActionRecord,
  MessageChannel,
  ReviewRequest,
  ReviewRequestSendStatus,
  ReviewRequestStatus,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SafetyEventStatus = "success" | "warning" | "danger" | "neutral";

export type SafetyEvent = {
  id: string;
  occurredAt: string;
  eventType: string;
  title: string;
  description: string;
  status: SafetyEventStatus;
  source: string;
  channel: string | null;
  leadId: string | null;
  wasAnythingSent: boolean;
  nextAction: string;
};

type EventReviewRequest = Pick<
  ReviewRequest,
  | "id"
  | "lead_id"
  | "customer_name"
  | "phone"
  | "email"
  | "channel"
  | "status"
  | "send_status"
  | "provider"
  | "provider_message_id"
  | "sent_at"
  | "clicked_at"
  | "blocked_at"
  | "failed_at"
  | "duplicate_prevented_at"
  | "failure_reason"
  | "blocked_reason"
  | "duplicate_reason"
  | "source"
  | "created_at"
  | "updated_at"
>;

type EventAutomationAction = Pick<
  AutomationActionRecord,
  | "id"
  | "lead_id"
  | "action_type"
  | "status"
  | "channel"
  | "title"
  | "send_status"
  | "send_error"
  | "source"
  | "created_at"
  | "updated_at"
>;

function statusFromAttention(attentionLevel: ReturnType<typeof getReviewRequestLifecycle>["attentionLevel"]): SafetyEventStatus {
  if (attentionLevel === "success") return "success";
  if (attentionLevel === "danger") return "danger";
  if (attentionLevel === "warning") return "warning";
  return "neutral";
}

function formatChannel(channel: MessageChannel | null) {
  if (channel === "sms") return "SMS";
  if (channel === "email") return "Email";
  return null;
}

function actionStatus(status: EventAutomationAction["status"]): SafetyEventStatus {
  if (status === "sent" || status === "reviewed") return "success";
  if (status === "blocked" || status === "send_failed") return "warning";
  return "neutral";
}

function actionDescription(action: EventAutomationAction) {
  if (action.status === "pending_review") return "Manual review is required before anything can be sent.";
  if (action.status === "sent" && action.send_status === "skipped") {
    return "Action was processed in test/skip mode. No live provider message was sent.";
  }
  if (action.status === "sent") return "Action was processed through the manual send path.";
  if (action.status === "blocked") return action.send_error ?? "Action was blocked before provider delivery.";
  if (action.status === "send_failed") return action.send_error ?? "Manual send path failed.";
  if (action.status === "reviewed") return "Operator marked this action reviewed without sending.";
  if (action.status === "dismissed") return "Operator dismissed this action.";
  return "Automation action lifecycle changed.";
}

export async function getRecentSafetyEvents(
  supabase: SupabaseServerClient,
  businessId: string,
  limit = 8
): Promise<{ events: SafetyEvent[]; error: string | null }> {
  const [reviewRequestsResult, actionsResult] = await Promise.all([
    supabase
      .from("review_requests")
      .select(
        "id, lead_id, customer_name, phone, email, channel, status, send_status, provider, provider_message_id, sent_at, clicked_at, blocked_at, failed_at, duplicate_prevented_at, failure_reason, blocked_reason, duplicate_reason, source, created_at, updated_at"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("automation_actions")
      .select(
        "id, lead_id, action_type, status, channel, title, send_status, send_error, source, created_at, updated_at"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const error = reviewRequestsResult.error?.message ?? actionsResult.error?.message ?? null;
  const reviewEvents = ((reviewRequestsResult.data ?? []) as EventReviewRequest[]).map((request) => {
    const lifecycle = getReviewRequestLifecycle({
      ...request,
      send_status: request.send_status as ReviewRequestSendStatus | null,
      status: request.status as ReviewRequestStatus,
    });

    return {
      id: `review-${request.id}`,
      occurredAt: lifecycle.timestamp ?? request.created_at,
      eventType: `review_request.${lifecycle.kind}`,
      title: `${lifecycle.label}: ${request.customer_name || "Review request"}`,
      description: `${lifecycle.shortExplanation} ${lifecycle.sentCopy}${
        lifecycle.reason ? ` Reason: ${lifecycle.reason}` : ""
      } Destination: ${getSafeReviewRequestDestination(request)}.`,
      status: statusFromAttention(lifecycle.attentionLevel),
      source: request.source ?? "manual",
      channel: formatChannel(request.channel),
      leadId: request.lead_id,
      wasAnythingSent: lifecycle.wasAnythingSent,
      nextAction: lifecycle.operatorNextAction,
    } satisfies SafetyEvent;
  });
  const actionEvents = ((actionsResult.data ?? []) as EventAutomationAction[]).map((action) => ({
    id: `action-${action.id}`,
    occurredAt: action.updated_at ?? action.created_at,
    eventType: `automation_action.${action.status}`,
    title: action.title,
    description: actionDescription(action),
    status: actionStatus(action.status),
    source: action.source ?? "automation",
    channel: formatChannel(action.channel),
    leadId: action.lead_id,
    wasAnythingSent: action.status === "sent" && action.send_status === "sent",
    nextAction:
      action.status === "pending_review"
        ? "Review this action manually."
        : "No automatic follow-up is started by this event.",
  }));

  const events = [...reviewEvents, ...actionEvents]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);

  return { events, error };
}
