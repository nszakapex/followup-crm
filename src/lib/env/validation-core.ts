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

function getDeliveryMode(env: EnvLike, nodeEnv: string): DeliverySafetyMode {
  if (isTruthy(env.REVIEW_REQUEST_SKIP_DELIVERY)) return "skip";
  if (isTruthy(env.REVIEW_REQUEST_TEST_MODE)) return "test";

  const explicitlyLive =
    isExplicitlyFalse(env.REVIEW_REQUEST_SKIP_DELIVERY) &&
    isExplicitlyFalse(env.REVIEW_REQUEST_TEST_MODE);

  if (nodeEnv !== "production" && !explicitlyLive) return "development_skip";

  return "live";
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
  const smsProviderConfigured = Boolean(
    hasValue(env.TWILIO_ACCOUNT_SID) &&
      hasValue(env.TWILIO_AUTH_TOKEN) &&
      (hasValue(env.TWILIO_MESSAGING_SERVICE_SID) ||
        hasValue(env.TWILIO_FROM_NUMBER) ||
        hasValue(env.TWILIO_PHONE_NUMBER))
  );
  const emailProviderConfigured = Boolean(
    hasValue(env.RESEND_API_KEY) && hasValue(env.RESEND_FROM_EMAIL)
  );
  const liveProviderConfigured = smsProviderConfigured || emailProviderConfigured;

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
      id: "sms_provider",
      label: "SMS provider",
      configured: smsProviderConfigured,
      requiredInProduction: false,
      status: smsProviderConfigured ? "pass" : "warning",
      explanation: smsProviderConfigured
        ? "SMS provider settings are present server-side."
        : "SMS live delivery is not configured. This is acceptable for test/skip mode or email-only pilots.",
      nextAction: smsProviderConfigured ? undefined : "Configure Twilio only when ready for SMS validation.",
    },
    {
      id: "email_provider",
      label: "Email provider",
      configured: emailProviderConfigured,
      requiredInProduction: false,
      status: emailProviderConfigured ? "pass" : "warning",
      explanation: emailProviderConfigured
        ? "Email provider settings are present server-side."
        : "Email live delivery is not configured. This is acceptable for test/skip mode or SMS-only pilots.",
      nextAction: emailProviderConfigured ? undefined : "Configure Resend only when ready for email validation.",
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
    hasValue(env.SUPABASE_SERVICE_ROLE_KEY);

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
