import {
  getSelectedSmsProviderName,
  getSmsProviderLabel,
  isRealSmsProvider,
  normalizeSmsProviderName,
} from "@/lib/sms/provider";
import type { SmsProviderName } from "@/lib/sms/types";

export type EnvCheckStatus = "pass" | "warning" | "fail";
export type EnvOverallStatus = "ready" | "warning" | "blocked";
export type DeliverySafetyMode = "live" | "test" | "skip" | "development_skip" | "blocked";

export type EnvValidationCheck = {
  id: string;
  label: string;
  status: EnvCheckStatus;
  configured: boolean;
  requiredInProduction: boolean;
  explanation: string;
  nextAction?: string;
};

export type EnvValidationResult = {
  status: EnvOverallStatus;
  mode: DeliverySafetyMode;
  summary: string;
  checks: EnvValidationCheck[];
  missingRequiredProduction: string[];
  readyForConciergePilot: boolean;
};

type EnvLike = Record<string, string | undefined>;

function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function isExplicitlyFalse(value: string | undefined) {
  return ["0", "false", "no", "off"].includes((value ?? "").toLowerCase());
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function isApprovedA2PStatus(value: string | undefined) {
  const normalized = value?.trim().toLowerCase().replaceAll("-", "_") ?? "";
  return ["approved", "active", "verified", "complete", "completed"].includes(normalized);
}

function getDeliveryMode(env: EnvLike, nodeEnv: string): DeliverySafetyMode {
  if (isTruthy(env.REVIEW_REQUEST_SKIP_DELIVERY)) return "skip";
  if (isTruthy(env.REVIEW_REQUEST_TEST_MODE)) return "test";

  const explicitlyLive =
    isExplicitlyFalse(env.REVIEW_REQUEST_SKIP_DELIVERY) &&
    isExplicitlyFalse(env.REVIEW_REQUEST_TEST_MODE);

  if (nodeEnv !== "production" && !explicitlyLive) return "development_skip";

  return "live";
}

function getSmsProviderConfigured(env: EnvLike, provider: SmsProviderName) {
  if (provider === "mock") return true;
  if (provider === "twilio") {
    return Boolean(
      hasValue(env.TWILIO_ACCOUNT_SID) &&
        hasValue(env.TWILIO_AUTH_TOKEN) &&
        (hasValue(env.TWILIO_MESSAGING_SERVICE_SID) ||
          hasValue(env.TWILIO_FROM_NUMBER) ||
          hasValue(env.TWILIO_PHONE_NUMBER))
    );
  }
  return false;
}

function getSmsProviderExplanation({
  provider,
  configured,
  complianceApproved,
  invalidProvider,
}: {
  provider: SmsProviderName;
  configured: boolean;
  complianceApproved: boolean;
  invalidProvider: boolean;
}) {
  if (invalidProvider) {
    return "SMS_PROVIDER is not recognized. The app will fall back to mock SMS until a supported provider is selected.";
  }
  if (provider === "mock") {
    return "Mock SMS is selected. SMS attempts are recorded safely; no live SMS provider is called.";
  }
  if (!configured) return `${getSmsProviderLabel(provider)} is selected but not configured.`;
  if (!complianceApproved) {
    return `${getSmsProviderLabel(provider)} is configured, but live SMS remains blocked until compliance is approved.`;
  }
  return `${getSmsProviderLabel(provider)} settings and compliance approval are present server-side.`;
}

function buildCheck({
  id,
  label,
  configured,
  requiredInProduction,
  explanation,
  nextAction,
  nodeEnv,
}: {
  id: string;
  label: string;
  configured: boolean;
  requiredInProduction: boolean;
  explanation: string;
  nextAction?: string;
  nodeEnv: string;
}): EnvValidationCheck {
  return {
    id,
    label,
    configured,
    requiredInProduction,
    explanation,
    nextAction,
    status: configured ? "pass" : requiredInProduction && nodeEnv === "production" ? "fail" : "warning",
  };
}

export function validateEnvironment(
  env: EnvLike,
  nodeEnv = env.NODE_ENV ?? "development"
): EnvValidationResult {
  const mode = getDeliveryMode(env, nodeEnv);
  const smsEnabled = isTruthy(env.SMS_ENABLED);
  const selectedSmsProvider = getSelectedSmsProviderName(env);
  const invalidSmsProvider = Boolean(env.SMS_PROVIDER && !normalizeSmsProviderName(env.SMS_PROVIDER));
  const smsProviderConfigured = smsEnabled && !invalidSmsProvider
    ? getSmsProviderConfigured(env, selectedSmsProvider)
    : false;
  const smsComplianceApproved = Boolean(
    isTruthy(env.SMS_COMPLIANCE_APPROVED) ||
      isApprovedA2PStatus(env.SMS_COMPLIANCE_STATUS) ||
      isApprovedA2PStatus(env.TWILIO_A2P_CAMPAIGN_STATUS)
  );
  const smsLiveReady =
    !invalidSmsProvider &&
    smsEnabled &&
    isRealSmsProvider(selectedSmsProvider) &&
    smsProviderConfigured &&
    smsComplianceApproved;
  const emailProviderConfigured = Boolean(
    hasValue(env.RESEND_API_KEY) &&
      hasValue(env.RESEND_FROM_EMAIL) &&
      (hasValue(env.OWNER_NOTIFY_EMAIL) || hasValue(env.NOTIFICATION_EMAIL))
  );
  const liveProviderConfigured = smsLiveReady || emailProviderConfigured;

  const checks: EnvValidationCheck[] = [
    buildCheck({
      id: "supabase_url",
      label: "Supabase project URL",
      configured: hasValue(env.NEXT_PUBLIC_SUPABASE_URL),
      requiredInProduction: true,
      explanation: "Required for authenticated app and database access.",
      nextAction: "Set NEXT_PUBLIC_SUPABASE_URL.",
      nodeEnv,
    }),
    buildCheck({
      id: "supabase_anon_key",
      label: "Supabase anon key",
      configured: hasValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      requiredInProduction: true,
      explanation: "Required for browser-safe Supabase auth and RLS queries.",
      nextAction: "Set NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      nodeEnv,
    }),
    buildCheck({
      id: "supabase_service_role",
      label: "Supabase service role key",
      configured: hasValue(env.SUPABASE_SERVICE_ROLE_KEY),
      requiredInProduction: true,
      explanation: "Required for signup setup, webhook ingestion, and server-only maintenance paths.",
      nextAction: "Set SUPABASE_SERVICE_ROLE_KEY on the server only.",
      nodeEnv,
    }),
    buildCheck({
      id: "app_url",
      label: "Public app URL",
      configured: hasValue(env.NEXT_PUBLIC_SITE_URL) || hasValue(env.NEXT_PUBLIC_APP_URL),
      requiredInProduction: true,
      explanation: "Required for auth callbacks, reset links, and tracked review links in production.",
      nextAction: "Set NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL to the production origin.",
      nodeEnv,
    }),
    buildCheck({
      id: "automation_secret",
      label: "Automation run secret",
      configured: hasValue(env.AUTOMATION_RUN_SECRET) || hasValue(env.CRON_SECRET),
      requiredInProduction: true,
      explanation: "Required for protected automation check endpoints. These endpoints still cannot send providers.",
      nextAction: "Set AUTOMATION_RUN_SECRET to a long server-only value.",
      nodeEnv,
    }),
    buildCheck({
      id: "inbound_webhook_secret",
      label: "Inbound lead webhook secret",
      configured: hasValue(env.INBOUND_WEBHOOK_SECRET) || hasValue(env.WEBHOOK_SECRET),
      requiredInProduction: true,
      explanation: "Required for protected POST /api/webhooks/leads intake from Zapier, Make, forms, or missed-call tools.",
      nextAction: "Set INBOUND_WEBHOOK_SECRET to a long server-only value.",
      nodeEnv,
    }),
    buildCheck({
      id: "owner_notification_email",
      label: "Owner notification email",
      configured: hasValue(env.OWNER_NOTIFY_EMAIL) || hasValue(env.NOTIFICATION_EMAIL),
      requiredInProduction: true,
      explanation: "Required so new leads can notify the owner through Resend.",
      nextAction: "Set OWNER_NOTIFY_EMAIL or NOTIFICATION_EMAIL.",
      nodeEnv,
    }),
    {
      id: "delivery_safety_mode",
      label: "Review delivery safety mode",
      configured: mode !== "blocked",
      requiredInProduction: false,
      status: mode === "live" && !liveProviderConfigured ? "warning" : "pass",
      explanation:
        mode === "live"
          ? "Live mode is selected. Provider configuration is checked before each manual send."
          : "Non-live mode is active. Review requests may be recorded, but no provider message is sent.",
      nextAction:
        mode === "live" && !liveProviderConfigured
          ? "Configure one provider before live manual send validation."
          : undefined,
    },
    {
      id: "sms_enabled",
      label: "SMS enabled flag",
      configured: hasValue(env.SMS_ENABLED),
      requiredInProduction: false,
      status: "pass",
      explanation: smsEnabled
        ? "SMS_ENABLED=true. Live SMS still requires a real provider, credentials, and compliance approval."
        : "SMS_ENABLED=false. SMS sends are blocked and Twilio configuration is optional.",
      nextAction: smsEnabled ? undefined : "Keep SMS_ENABLED=false for v1 unless live SMS is intentionally validated.",
    },
    {
      id: "sms_provider",
      label: "SMS provider",
      configured: smsEnabled ? smsProviderConfigured && !invalidSmsProvider : true,
      requiredInProduction: false,
      status: !smsEnabled
        ? "pass"
        : invalidSmsProvider
        ? "warning"
        : smsLiveReady || selectedSmsProvider === "mock"
          ? "pass"
          : "warning",
      explanation: getSmsProviderExplanation({
        provider: selectedSmsProvider,
        configured: smsProviderConfigured || !smsEnabled,
        complianceApproved: smsComplianceApproved,
        invalidProvider: invalidSmsProvider,
      }),
      nextAction:
        !smsEnabled
          ? undefined
          : selectedSmsProvider === "mock"
          ? "Keep SMS_PROVIDER=mock for local/test mode. Select a real provider only for controlled live SMS validation."
          : smsProviderConfigured && !smsComplianceApproved
            ? "Set SMS_COMPLIANCE_APPROVED=true only after SMS compliance approval."
            : smsProviderConfigured
              ? undefined
              : `Configure ${getSmsProviderLabel(selectedSmsProvider)} only when ready for SMS validation.`,
    },
    {
      id: "email_provider",
      label: "Email provider",
      configured: emailProviderConfigured,
      requiredInProduction: true,
      status: emailProviderConfigured ? "pass" : nodeEnv === "production" ? "fail" : "warning",
      explanation: emailProviderConfigured
        ? "Resend provider settings and owner notification recipient are present server-side."
        : "Resend API key, sender email, and owner notification recipient are required for v1 lead alerts.",
      nextAction: emailProviderConfigured
        ? undefined
        : "Set RESEND_API_KEY, RESEND_FROM_EMAIL, and OWNER_NOTIFY_EMAIL.",
    },
  ];

  const missingRequiredProduction = checks
    .filter((check) => check.requiredInProduction && !check.configured)
    .map((check) => check.label);
  const failingChecks = checks.filter((check) => check.status === "fail");
  const warningChecks = checks.filter((check) => check.status === "warning");
  const status: EnvOverallStatus =
    failingChecks.length > 0 ? "blocked" : warningChecks.length > 0 ? "warning" : "ready";
  const readyForConciergePilot =
    hasValue(env.NEXT_PUBLIC_SUPABASE_URL) &&
    hasValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    hasValue(env.SUPABASE_SERVICE_ROLE_KEY) &&
    (hasValue(env.INBOUND_WEBHOOK_SECRET) || hasValue(env.WEBHOOK_SECRET));

  return {
    status,
    mode,
    checks,
    missingRequiredProduction,
    readyForConciergePilot,
    summary:
      status === "blocked"
        ? "Production environment configuration is missing required server settings."
        : readyForConciergePilot
          ? "Core Supabase configuration is present for a manually supported concierge pilot."
          : "Core Supabase configuration is incomplete. Finish server setup before pilot use.",
  };
}
