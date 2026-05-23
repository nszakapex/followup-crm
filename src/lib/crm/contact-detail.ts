import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  getEmailProviderReadiness,
  getSmsProviderReadiness,
  shouldSkipReviewDelivery,
} from "@/lib/messaging/provider-config";
import type {
  AuditLog,
  AutomationActionRecord,
  Business,
  Lead,
  Message,
  ReviewRequest,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ContactTimelineStatus = "success" | "warning" | "error" | "neutral";
export type ContactTimelineType =
  | "contact_created"
  | "lead_captured"
  | "review_request_created"
  | "review_request_sent"
  | "review_request_failed"
  | "review_request_clicked"
  | "automation_action_created"
  | "automation_action_reviewed"
  | "automation_action_dismissed"
  | "automation_action_sent"
  | "automation_action_failed"
  | "automation_action_blocked"
  | "message_sent"
  | "message_received"
  | "note"
  | "audit";

export type ContactTimelineItem = {
  id: string;
  type: ContactTimelineType;
  title: string;
  description: string | null;
  status: ContactTimelineStatus;
  occurredAt: string;
  source: string;
  metadata: Record<string, unknown>;
  href?: string | null;
};

export type ContactNextBestAction = {
  label: string;
  reason: string;
  href: string | null;
};

export type ContactDetail = {
  id: string;
  type: "lead";
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: Lead["status"];
  createdAt: string;
  updatedAt: string | null;
  lastActivityAt: string | null;
  reviewStatus: {
    hasReviewLink: boolean;
    lastReviewRequestAt: string | null;
    reviewRequestCount: number;
    lastReviewRequestStatus: ReviewRequest["status"] | null;
  };
  automationStatus: {
    pendingActionCount: number;
    lastAutomationActionAt: string | null;
    lastAutomationActionStatus: AutomationActionRecord["status"] | null;
  };
  sendStatus: {
    lastSentAt: string | null;
    lastSendChannel: Message["channel"] | null;
    lastSendStatus: Message["status"] | AutomationActionRecord["send_status"] | null;
    failedSendCount: number;
  };
  nextBestAction: ContactNextBestAction;
};

export type ContactDetailResult = {
  lead: Lead | null;
  business: Pick<
    Business,
    "id" | "google_review_link" | "twilio_from_number" | "resend_from_email"
  > | null;
  detail: ContactDetail | null;
  messages: Message[];
  reviewRequests: ReviewRequest[];
  automationActions: AutomationActionRecord[];
  pendingAutomationActions: AutomationActionRecord[];
  timeline: ContactTimelineItem[];
  errors: string[];
  notFound: boolean;
};

function getName(lead: Pick<Lead, "first_name" | "last_name">) {
  return `${lead.first_name} ${lead.last_name ?? ""}`.trim() || "Unnamed lead";
}

function getDate(value: string | null | undefined) {
  return value ? new Date(value).getTime() : 0;
}

function newestDate(values: Array<string | null | undefined>) {
  const newest = values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => getDate(b) - getDate(a))[0];

  return newest ?? null;
}

function getMessageStatus(message: Message): ContactTimelineStatus {
  if (message.status === "failed") return "error";
  if (message.provider === "test_mode") return "warning";
  if (message.direction === "outbound") return "success";
  return "neutral";
}

function getMessageTitle(message: Message) {
  if (message.direction === "internal") return "Internal note added";
  if (message.direction === "inbound") return "Inbound message received";
  if (message.provider === "test_mode") return "Message created in test mode";
  if (message.status === "failed") return "Message failed";
  return "Message sent";
}

function getReviewTimelineItems(request: ReviewRequest): ContactTimelineItem[] {
  const channel = request.channel === "sms" ? "SMS" : request.channel === "email" ? "email" : "manual";
  const items: ContactTimelineItem[] = [
    {
      id: `review-created-${request.id}`,
      type: "review_request_created",
      title: "Review request created",
      description: `Created for ${channel}.`,
      status: request.status === "failed" ? "error" : "neutral",
      occurredAt: request.created_at,
      source: "review_requests",
      metadata: {
        reviewRequestId: request.id,
        channel: request.channel,
        status: request.status,
      },
    },
  ];

  if (request.sent_at) {
    items.push({
      id: `review-sent-${request.id}`,
      type: request.status === "failed" ? "review_request_failed" : "review_request_sent",
      title: request.status === "failed" ? "Review request failed" : "Review request sent",
      description:
        request.status === "failed"
          ? "Delivery did not complete for this review request."
          : `Sent by ${channel}.`,
      status: request.status === "failed" ? "error" : "success",
      occurredAt: request.sent_at,
      source: "review_requests",
      metadata: {
        reviewRequestId: request.id,
        channel: request.channel,
        status: request.status,
      },
    });
  }

  if (request.clicked_at) {
    items.push({
      id: `review-clicked-${request.id}`,
      type: "review_request_clicked",
      title: "Review link clicked",
      description: "The tracked review link was opened.",
      status: "success",
      occurredAt: request.clicked_at,
      source: "review_requests",
      metadata: {
        reviewRequestId: request.id,
        channel: request.channel,
        status: request.status,
      },
    });
  }

  return items;
}

function getAutomationTimelineItems(action: AutomationActionRecord): ContactTimelineItem[] {
  const items: ContactTimelineItem[] = [
    {
      id: `automation-created-${action.id}`,
      type: "automation_action_created",
      title: "Automation action created",
      description: action.reason,
      status: action.status === "pending_review" ? "warning" : "neutral",
      occurredAt: action.created_at,
      source: "automation_actions",
      metadata: {
        actionId: action.id,
        actionType: action.action_type,
        status: action.status,
        reasonCode: action.reason_code,
      },
      href: "/automations",
    },
  ];

  if (action.reviewed_at) {
    items.push({
      id: `automation-reviewed-${action.id}`,
      type: "automation_action_reviewed",
      title: "Automation action reviewed",
      description: action.title,
      status: "success",
      occurredAt: action.reviewed_at,
      source: "automation_actions",
      metadata: { actionId: action.id, status: action.status },
      href: "/automations",
    });
  }

  if (action.dismissed_at) {
    items.push({
      id: `automation-dismissed-${action.id}`,
      type: "automation_action_dismissed",
      title: "Automation action dismissed",
      description: action.title,
      status: "neutral",
      occurredAt: action.dismissed_at,
      source: "automation_actions",
      metadata: { actionId: action.id, status: action.status },
      href: "/automations",
    });
  }

  if (action.sent_at) {
    items.push({
      id: `automation-sent-${action.id}`,
      type: "automation_action_sent",
      title: action.send_status === "skipped" ? "Automation action approved" : "Automation action sent",
      description:
        action.send_status === "skipped"
          ? "Delivery was skipped in test mode."
          : action.title,
      status: action.send_status === "skipped" ? "warning" : "success",
      occurredAt: action.sent_at,
      source: "automation_actions",
      metadata: {
        actionId: action.id,
        status: action.status,
        sendStatus: action.send_status,
        provider: action.provider,
      },
      href: "/automations",
    });
  }

  if (action.status === "send_failed" || action.status === "blocked") {
    items.push({
      id: `automation-${action.status}-${action.id}`,
      type: action.status === "send_failed" ? "automation_action_failed" : "automation_action_blocked",
      title: action.status === "send_failed" ? "Automation send failed" : "Automation send blocked",
      description: action.send_error ?? action.title,
      status: action.status === "send_failed" ? "error" : "warning",
      occurredAt: action.updated_at,
      source: "automation_actions",
      metadata: {
        actionId: action.id,
        status: action.status,
        sendStatus: action.send_status,
        provider: action.provider,
      },
      href: "/automations",
    });
  }

  return items;
}

function getAuditTimelineItem(audit: AuditLog): ContactTimelineItem {
  const label = audit.action
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" ");

  return {
    id: `audit-${audit.id}`,
    type: "audit",
    title: label.charAt(0).toUpperCase() + label.slice(1),
    description: null,
    status: audit.action.includes("failed") ? "error" : "neutral",
    occurredAt: audit.created_at,
    source: "audit_logs",
    metadata: {
      auditLogId: audit.id,
      action: audit.action,
      entityType: audit.entity_type,
      entityId: audit.entity_id,
    },
  };
}

function getNextBestAction({
  lead,
  business,
  reviewRequests,
  pendingActions,
  failedSendCount,
}: {
  lead: Lead;
  business: ContactDetailResult["business"];
  reviewRequests: ReviewRequest[];
  pendingActions: AutomationActionRecord[];
  failedSendCount: number;
}): ContactNextBestAction {
  if (!lead.phone && !lead.email) {
    return {
      label: "Add contact information",
      reason: "This record needs a phone number or email before any manual request can be sent.",
      href: null,
    };
  }

  if (pendingActions.length > 0) {
    return {
      label: "Review pending automation action",
      reason: "An automation has already suggested the next step for this record.",
      href: "#pending-actions",
    };
  }

  if (failedSendCount > 0) {
    return {
      label: "Review failed send",
      reason: "A recent message or automation action failed or was blocked.",
      href: "#activity",
    };
  }

  if (!business?.google_review_link) {
    return {
      label: "Configure review link",
      reason: "Review requests need a Google review link before this person can be sent there.",
      href: "/setup",
    };
  }

  const smsReady = getSmsProviderReadiness(business.twilio_from_number);
  const emailReady = getEmailProviderReadiness(business.resend_from_email);
  const hasUsableDelivery =
    shouldSkipReviewDelivery() ||
    (lead.phone && smsReady.configured) ||
    (lead.email && emailReady.configured);

  if (!hasUsableDelivery) {
    return {
      label: "Finish provider setup",
      reason: "Sending is blocked until SMS or email delivery is configured, or test mode is active.",
      href: "/setup",
    };
  }

  if (reviewRequests.length === 0 && ["completed", "review_requested"].includes(lead.status)) {
    return {
      label: "Send a review request",
      reason: "This record is ready for a simple request for an honest Google review.",
      href: "/reviews",
    };
  }

  if (lead.status === "new" || lead.status === "needs_reply") {
    return {
      label: "Review lead details",
      reason: "This lead still needs a human review before the next follow-up.",
      href: null,
    };
  }

  return {
    label: "No immediate action",
    reason: "The core record is up to date. Keep an eye on future replies, clicks, and automation actions.",
    href: null,
  };
}

export async function getLeadDetail(
  supabase: SupabaseServerClient,
  businessId: string,
  leadId: string
): Promise<ContactDetailResult> {
  const errors: string[] = [];

  const [
    { data: leadData, error: leadError },
    { data: businessData, error: businessError },
    { data: messagesData, error: messagesError },
    { data: reviewRequestsData, error: reviewRequestsError },
    { data: automationActionsData, error: automationActionsError },
    { data: auditLogsData, error: auditLogsError },
  ] = await Promise.all([
    supabase.from("leads").select("*").eq("business_id", businessId).eq("id", leadId).maybeSingle(),
    supabase
      .from("businesses")
      .select("id, google_review_link, twilio_from_number, resend_from_email")
      .eq("id", businessId)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("*")
      .eq("business_id", businessId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("review_requests")
      .select("*")
      .eq("business_id", businessId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("automation_actions")
      .select("*")
      .eq("business_id", businessId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("audit_logs")
      .select("id, business_id, user_id, action, entity_type, entity_id, metadata_json, created_at")
      .eq("business_id", businessId)
      .eq("entity_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (leadError) errors.push(`Lead lookup failed: ${leadError.message}`);
  if (businessError) errors.push(`Business setup lookup failed: ${businessError.message}`);
  if (messagesError) errors.push(`Message history lookup failed: ${messagesError.message}`);
  if (reviewRequestsError) errors.push(`Review request history lookup failed: ${reviewRequestsError.message}`);
  if (automationActionsError) errors.push(`Automation action lookup failed: ${automationActionsError.message}`);
  if (auditLogsError) errors.push(`Audit timeline lookup failed: ${auditLogsError.message}`);

  if (!leadData) {
    return {
      lead: null,
      business: (businessData as ContactDetailResult["business"]) ?? null,
      detail: null,
      messages: [],
      reviewRequests: [],
      automationActions: [],
      pendingAutomationActions: [],
      timeline: [],
      errors,
      notFound: !leadError,
    };
  }

  const lead = leadData as Lead;
  const business = (businessData as ContactDetailResult["business"]) ?? null;
  const messages = (messagesData ?? []) as Message[];
  const reviewRequests = (reviewRequestsData ?? []) as ReviewRequest[];
  const automationActions = (automationActionsData ?? []) as AutomationActionRecord[];
  const auditLogs = (auditLogsData ?? []) as AuditLog[];
  const pendingAutomationActions = automationActions.filter(
    (action) => action.status === "pending_review"
  );
  const latestReviewRequest = reviewRequests[0] ?? null;
  const latestAutomationAction = automationActions[0] ?? null;
  const outboundMessages = messages.filter((message) => message.direction === "outbound");
  const lastOutboundMessage = outboundMessages[0] ?? null;
  const failedMessages = messages.filter((message) => message.status === "failed").length;
  const failedActions = automationActions.filter(
    (action) => action.status === "send_failed" || action.status === "blocked"
  ).length;
  const failedSendCount = failedMessages + failedActions;
  const lastActivityAt = newestDate([
    lead.updated_at,
    messages[0]?.created_at,
    latestReviewRequest?.clicked_at,
    latestReviewRequest?.sent_at,
    latestReviewRequest?.created_at,
    latestAutomationAction?.updated_at,
    latestAutomationAction?.created_at,
  ]);
  const leadTimelineItem: ContactTimelineItem = {
    id: `lead-created-${lead.id}`,
    type: lead.consent_source === "website_webhook" ? "lead_captured" : "contact_created",
    title: lead.consent_source === "website_webhook" ? "Lead captured" : "Lead record created",
    description: lead.source ? `Source: ${lead.source}` : null,
    status: "neutral",
    occurredAt: lead.created_at,
    source: lead.consent_source === "website_webhook" ? "lead_webhook" : "leads",
    metadata: {
      leadId: lead.id,
      source: lead.source,
      status: lead.status,
    },
  };

  const timeline: ContactTimelineItem[] = [
    leadTimelineItem,
    ...messages.map<ContactTimelineItem>((message) => ({
      id: `message-${message.id}`,
      type:
        message.direction === "internal"
          ? "note"
          : message.direction === "inbound"
            ? "message_received"
            : "message_sent",
      title: getMessageTitle(message),
      description: message.body,
      status: getMessageStatus(message),
      occurredAt: message.sent_at ?? message.received_at ?? message.created_at,
      source: "messages",
      metadata: {
        messageId: message.id,
        channel: message.channel,
        direction: message.direction,
        status: message.status,
        provider: message.provider,
      },
    })),
    ...reviewRequests.flatMap(getReviewTimelineItems),
    ...automationActions.flatMap(getAutomationTimelineItems),
    ...auditLogs.map(getAuditTimelineItem),
  ].sort((a, b) => getDate(b.occurredAt) - getDate(a.occurredAt));

  const detail: ContactDetail = {
    id: lead.id,
    type: "lead",
    businessId,
    name: getName(lead),
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    status: lead.status,
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
    lastActivityAt,
    reviewStatus: {
      hasReviewLink: Boolean(business?.google_review_link),
      lastReviewRequestAt:
        latestReviewRequest?.sent_at ?? latestReviewRequest?.created_at ?? null,
      reviewRequestCount: reviewRequests.length,
      lastReviewRequestStatus: latestReviewRequest?.status ?? null,
    },
    automationStatus: {
      pendingActionCount: pendingAutomationActions.length,
      lastAutomationActionAt: latestAutomationAction?.created_at ?? null,
      lastAutomationActionStatus: latestAutomationAction?.status ?? null,
    },
    sendStatus: {
      lastSentAt:
        lastOutboundMessage?.sent_at ??
        automationActions.find((action) => action.sent_at)?.sent_at ??
        null,
      lastSendChannel: lastOutboundMessage?.channel ?? null,
      lastSendStatus:
        lastOutboundMessage?.status ??
        automationActions.find((action) => action.send_status)?.send_status ??
        null,
      failedSendCount,
    },
    nextBestAction: getNextBestAction({
      lead,
      business,
      reviewRequests,
      pendingActions: pendingAutomationActions,
      failedSendCount,
    }),
  };

  return {
    lead,
    business,
    detail,
    messages,
    reviewRequests,
    automationActions,
    pendingAutomationActions,
    timeline,
    errors,
    notFound: false,
  };
}
