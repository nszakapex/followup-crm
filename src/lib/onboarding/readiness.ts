import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  getEmailProviderReadiness,
  getSmsProviderReadiness,
  shouldSkipReviewDelivery,
} from "@/lib/messaging/provider-config";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ReadinessStatus = "ready" | "partial" | "blocked";
type SetupStatus = "complete" | "incomplete";
type ProviderStatus = "ready" | "blocked" | "not_configured";

type BusinessReadinessRow = {
  id: string;
  name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  website_url: string | null;
  google_review_link: string | null;
  timezone: string | null;
  twilio_from_number: string | null;
  sms_compliance_status: string | null;
  resend_from_email: string | null;
  review_requests_enabled: boolean | null;
  lead_followup_enabled: boolean | null;
  webhook_secret: string | null;
};

type AutomationReadinessRow = {
  id: string;
  type: string;
  enabled: boolean;
  message_template: string | null;
  last_triggered_at: string | null;
};

type ScheduleReadinessRow = {
  enabled: boolean;
  frequency: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string | null;
};

export type BusinessReadiness = {
  businessProfile: {
    status: SetupStatus;
    missing: string[];
    details: {
      businessName: boolean;
      website: boolean;
      phone: boolean;
      email: boolean;
      timezone: boolean;
    };
  };
  reviewSetup: {
    status: "ready" | "blocked";
    missing: string[];
    googleReviewLinkConfigured: boolean;
    defaultReviewMessageConfigured: boolean;
  };
  smsProvider: {
    status: ProviderStatus;
    missing: string[];
    canSend: boolean;
    blockedReason: string | null;
    testModeActive: boolean;
  };
  emailProvider: {
    status: ProviderStatus;
    missing: string[];
    canSend: boolean;
    blockedReason: string | null;
    testModeActive: boolean;
  };
  automationSetup: {
    status: ReadinessStatus;
    activeSystems: number;
    pausedSystems: number;
    scheduleMode: string | null;
    hasPendingActions: boolean;
    hasRecentRun: boolean;
    missing: string[];
    lastRunAt: string | null;
    nextRunAt: string | null;
    scheduleError: string | null;
  };
  dataSetup: {
    status: "ready" | "empty";
    customerCount: number;
    leadCount: number;
    hasTestableRecipient: boolean;
    missing: string[];
  };
  leadCapture: {
    status: "ready" | "blocked";
    webhookConfigured: boolean;
    recentWebhookEvents: number;
    missing: string[];
  };
  overall: {
    status: "ready" | "partial" | "blocked";
    score: number;
    total: number;
    nextBestAction: string;
    criticalMissing: string[];
  };
  errors: string[];
};

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

function providerStatus(configured: boolean, missing: string[]): ProviderStatus {
  if (configured) return "ready";
  return missing.length > 0 ? "not_configured" : "blocked";
}

function getScheduleMode(schedule: ScheduleReadinessRow | null) {
  if (!schedule || !schedule.enabled || schedule.frequency === "manual_only") {
    return "manual_only";
  }

  return schedule.frequency ?? "scheduled";
}

function getNextBestAction(missing: string[]) {
  return missing[0] ?? "Review pending automation actions";
}

export async function getBusinessReadiness(
  supabase: SupabaseServerClient,
  businessId: string
): Promise<BusinessReadiness> {
  const [
    businessResult,
    leadsResult,
    automationsResult,
    pendingActionsResult,
    runHistoryResult,
    scheduleResult,
    webhookEventsResult,
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "id, name, owner_email, owner_phone, website_url, google_review_link, timezone, twilio_from_number, sms_compliance_status, resend_from_email, review_requests_enabled, lead_followup_enabled, webhook_secret"
      )
      .eq("id", businessId)
      .maybeSingle(),
    supabase
      .from("leads")
      .select("id, phone, email", { count: "exact" })
      .eq("business_id", businessId),
    supabase
      .from("automations")
      .select("id, type, enabled, message_template, last_triggered_at")
      .eq("business_id", businessId),
    supabase
      .from("automation_actions")
      .select("id", { count: "exact" })
      .eq("business_id", businessId)
      .eq("status", "pending_review"),
    supabase
      .from("audit_logs")
      .select("id, created_at")
      .eq("business_id", businessId)
      .in("action", ["automation_run.completed", "automation_run.failed"])
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("automation_schedules")
      .select("enabled, frequency, last_run_at, next_run_at, last_status")
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("webhook_events")
      .select("id", { count: "exact" })
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const errors = [
    businessResult.error?.message,
    leadsResult.error?.message,
    automationsResult.error?.message,
    pendingActionsResult.error?.message,
    runHistoryResult.error?.message,
    webhookEventsResult.error?.message,
  ].filter(Boolean) as string[];

  const scheduleError = scheduleResult.error?.message ?? null;
  const business = businessResult.data as BusinessReadinessRow | null;
  const leads = (leadsResult.data ?? []) as { id: string; phone: string | null; email: string | null }[];
  const automations = (automationsResult.data ?? []) as AutomationReadinessRow[];
  const schedule = (scheduleResult.data ?? null) as ScheduleReadinessRow | null;
  const testModeActive = shouldSkipReviewDelivery();

  const businessProfileMissing = [
    hasValue(business?.name) ? null : "Business name",
    hasValue(business?.website_url) ? null : "Website",
    hasValue(business?.owner_phone) ? null : "Public phone",
    hasValue(business?.owner_email) ? null : "Public email",
    hasValue(business?.timezone) ? null : "Timezone",
  ].filter(Boolean) as string[];

  const reviewAutomation = automations.find((automation) => automation.type === "review_request");
  const defaultReviewMessageConfigured = Boolean(reviewAutomation?.message_template?.trim());
  const reviewMissing = [
    hasValue(business?.google_review_link) ? null : "Google review link",
    defaultReviewMessageConfigured ? null : "Default review request message",
  ].filter(Boolean) as string[];

  const smsReadiness = getSmsProviderReadiness(
    business?.twilio_from_number,
    business?.sms_compliance_status
  );
  const smsMissing = [
    smsReadiness.accountConfigured ? null : "Twilio account SID/auth token",
    smsReadiness.usesMessagingService || smsReadiness.senderConfigured
      ? null
      : "Twilio messaging service or from number",
    smsReadiness.complianceApproved || testModeActive ? null : "SMS A2P compliance approval",
  ].filter(Boolean) as string[];

  const emailReadiness = getEmailProviderReadiness(business?.resend_from_email);
  const emailMissing = [
    emailReadiness.apiKeyConfigured ? null : "Resend API key",
    emailReadiness.fromConfigured ? null : "Sender email",
  ].filter(Boolean) as string[];

  const activeSystems = automations.filter((automation) => automation.enabled).length;
  const pausedSystems = automations.length - activeSystems;
  const scheduleMode = getScheduleMode(schedule);
  const hasPendingActions = (pendingActionsResult.count ?? 0) > 0;
  const hasRecentRun = (runHistoryResult.data ?? []).length > 0;
  const automationMissing = [
    automations.length > 0 ? null : "Default automations",
    activeSystems > 0 ? null : "At least one active automation",
    business?.lead_followup_enabled ? null : "Lead follow-up enabled",
    scheduleMode !== "manual_only" ? null : "Scheduled checks enabled",
  ].filter(Boolean) as string[];

  const hasTestableRecipient = leads.some((lead) => hasValue(lead.phone) || hasValue(lead.email));
  const dataMissing = [
    leads.length > 0 ? null : "At least one lead/customer",
    hasTestableRecipient ? null : "Lead with phone or email",
  ].filter(Boolean) as string[];

  const webhookConfigured = hasValue(business?.webhook_secret);
  const leadCaptureMissing = [webhookConfigured ? null : "Lead capture webhook secret"].filter(
    Boolean
  ) as string[];

  const criticalMissing = [
    ...businessProfileMissing,
    ...reviewMissing,
    ...dataMissing,
  ];
  const scored = [
    businessProfileMissing.length === 0,
    reviewMissing.length === 0,
    smsReadiness.canAttemptLiveSend || testModeActive,
    emailReadiness.configured || testModeActive,
    dataMissing.length === 0,
    automations.length > 0,
    activeSystems > 0,
    hasRecentRun || hasPendingActions,
    webhookConfigured,
    scheduleMode !== "manual_only",
  ];
  const score = scored.filter(Boolean).length;
  const total = scored.length;
  const overallStatus =
    criticalMissing.length === 0 && score >= 8
      ? "ready"
      : criticalMissing.length > 0
        ? "blocked"
        : "partial";

  return {
    businessProfile: {
      status: businessProfileMissing.length === 0 ? "complete" : "incomplete",
      missing: businessProfileMissing,
      details: {
        businessName: hasValue(business?.name),
        website: hasValue(business?.website_url),
        phone: hasValue(business?.owner_phone),
        email: hasValue(business?.owner_email),
        timezone: hasValue(business?.timezone),
      },
    },
    reviewSetup: {
      status: reviewMissing.length === 0 ? "ready" : "blocked",
      missing: reviewMissing,
      googleReviewLinkConfigured: hasValue(business?.google_review_link),
      defaultReviewMessageConfigured,
    },
    smsProvider: {
      status: testModeActive
        ? "ready"
        : providerStatus(smsReadiness.canAttemptLiveSend, smsMissing),
      missing: smsMissing,
      canSend: smsReadiness.canAttemptLiveSend || testModeActive,
      blockedReason: testModeActive ? "Delivery is skipped in test mode." : smsReadiness.reason,
      testModeActive,
    },
    emailProvider: {
      status: testModeActive
        ? "ready"
        : providerStatus(emailReadiness.configured, emailMissing),
      missing: emailMissing,
      canSend: emailReadiness.configured || testModeActive,
      blockedReason: testModeActive ? "Delivery is skipped in test mode." : emailReadiness.reason,
      testModeActive,
    },
    automationSetup: {
      status:
        automations.length > 0 && activeSystems > 0
          ? scheduleMode === "manual_only"
            ? "partial"
            : "ready"
          : "blocked",
      activeSystems,
      pausedSystems,
      scheduleMode,
      hasPendingActions,
      hasRecentRun,
      missing: automationMissing,
      lastRunAt: schedule?.last_run_at ?? (runHistoryResult.data?.[0]?.created_at ?? null),
      nextRunAt: schedule?.next_run_at ?? null,
      scheduleError,
    },
    dataSetup: {
      status: dataMissing.length === 0 ? "ready" : "empty",
      customerCount: leadsResult.count ?? leads.length,
      leadCount: leadsResult.count ?? leads.length,
      hasTestableRecipient,
      missing: dataMissing,
    },
    leadCapture: {
      status: webhookConfigured ? "ready" : "blocked",
      webhookConfigured,
      recentWebhookEvents: webhookEventsResult.count ?? 0,
      missing: leadCaptureMissing,
    },
    overall: {
      status: overallStatus,
      score,
      total,
      nextBestAction: getNextBestAction([
        ...businessProfileMissing,
        ...reviewMissing,
        ...dataMissing,
        ...automationMissing,
      ]),
      criticalMissing,
    },
    errors,
  };
}
