import { createHmac, timingSafeEqual } from "node:crypto";

export type SmsReadinessState =
  | "missing_config"
  | "configured_but_not_approved"
  | "approved_ready_for_manual_test"
  | "blocked"
  | "test_mode";

export type InboundSmsHandling = "normal_reply" | "opt_out" | "opt_in" | "help";

export type SmsKind = "first_touch" | "followup" | "review_request" | "reply";

export type SmsConsentStatus = "unknown" | "opted_in" | "opted_out";

export type SmsComplianceApproval = {
  approved: boolean;
  source: "env" | "compliance_status" | "a2p_status" | "business_status" | null;
  complianceStatus: string | null;
  campaignStatus: string | null;
  businessStatus: string | null;
};

const OPT_OUT_KEYWORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
]);

const OPT_IN_KEYWORDS = new Set(["start", "yes", "unstop"]);
const HELP_KEYWORDS = new Set(["help", "info"]);
const APPROVED_STATUSES = new Set(["approved", "active", "verified", "complete", "completed"]);

export function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function normalizeSmsKeyword(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z]/g, "");
}

export function isOptOutKeyword(text: string): boolean {
  return OPT_OUT_KEYWORDS.has(normalizeSmsKeyword(text));
}

export function isOptInKeyword(text: string): boolean {
  return OPT_IN_KEYWORDS.has(normalizeSmsKeyword(text));
}

export function isHelpKeyword(text: string): boolean {
  return HELP_KEYWORDS.has(normalizeSmsKeyword(text));
}

export function classifyInboundSms(body: string): InboundSmsHandling {
  if (isOptOutKeyword(body)) return "opt_out";
  if (isOptInKeyword(body)) return "opt_in";
  if (isHelpKeyword(body)) return "help";
  return "normal_reply";
}

/**
 * Normalize a raw phone string to E.164. US-biased: bare 10-digit numbers are
 * assumed to be +1. Returns null when the input can't be a valid number.
 */
export function toE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function getSmsDigits(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

export function isValidSmsDestination(value: string | null | undefined) {
  const digits = getSmsDigits(value);
  return Boolean(digits && digits.length >= 10 && digits.length <= 15);
}

export function formatSmsDestinationForProvider(value: string) {
  const digits = getSmsDigits(value);
  if (!digits) return value.trim();
  if (value.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function getSmsPhoneMatchKeys(value: string | null | undefined) {
  const digits = getSmsDigits(value);
  if (!digits) return [];

  const keys = new Set<string>([digits, `+${digits}`]);
  if (digits.length === 10) keys.add(`1${digits}`);
  if (digits.length === 11 && digits.startsWith("1")) keys.add(digits.slice(1));

  return Array.from(keys);
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase().replaceAll("-", "_") || null;
}

function isApprovedStatus(value: string | null | undefined) {
  const normalized = normalizeStatus(value);
  return Boolean(normalized && APPROVED_STATUSES.has(normalized));
}

export function getSmsComplianceApproval(
  env: Record<string, string | undefined>,
  businessSmsComplianceStatus?: string | null
): SmsComplianceApproval {
  const complianceStatus = normalizeStatus(env.SMS_COMPLIANCE_STATUS);
  const campaignStatus = normalizeStatus(env.TWILIO_A2P_CAMPAIGN_STATUS);
  const businessStatus = normalizeStatus(businessSmsComplianceStatus);

  if (isTruthy(env.SMS_COMPLIANCE_APPROVED)) {
    return {
      approved: true,
      source: "env",
      complianceStatus,
      campaignStatus,
      businessStatus,
    };
  }

  if (isApprovedStatus(complianceStatus)) {
    return {
      approved: true,
      source: "compliance_status",
      complianceStatus,
      campaignStatus,
      businessStatus,
    };
  }

  if (isApprovedStatus(campaignStatus)) {
    return {
      approved: true,
      source: "a2p_status",
      complianceStatus,
      campaignStatus,
      businessStatus,
    };
  }

  if (isApprovedStatus(businessStatus)) {
    return {
      approved: true,
      source: "business_status",
      complianceStatus,
      campaignStatus,
      businessStatus,
    };
  }

  return {
    approved: false,
    source: null,
    complianceStatus,
    campaignStatus,
    businessStatus,
  };
}

export function getSmsReadinessState({
  deliverySkipped,
  providerConfigured,
  complianceApproved,
}: {
  deliverySkipped: boolean;
  providerConfigured: boolean;
  complianceApproved: boolean;
}): SmsReadinessState {
  if (deliverySkipped) return "test_mode";
  if (!providerConfigured) return "missing_config";
  if (!complianceApproved) return "configured_but_not_approved";
  return "approved_ready_for_manual_test";
}

/** Twilio error codes where retrying the same number is pointless. */
export const TWILIO_PERMANENT_ERROR_CODES = new Set([
  21211, // invalid To number
  21610, // recipient has opted out (Twilio-level block)
  21614, // To is not a mobile number
]);

/** 21610 at send time or in a status callback means: record the opt-out. */
export function isTwilioOptOutErrorCode(code: number | null | undefined): boolean {
  return code === 21610;
}

/**
 * True when the deployment is fully flipped for live automated SMS:
 * SMS on, a real provider selected, and A2P compliance approval recorded.
 * This is the env precondition for automation runs to dispatch providers.
 */
export function isSmsProviderSendReady(
  env: Record<string, string | undefined>,
  businessSmsComplianceStatus?: string | null
) {
  if (!isTruthy(env.SMS_ENABLED)) return false;

  const provider = (env.SMS_PROVIDER ?? "mock").trim().toLowerCase();
  if (!provider || provider === "mock") return false;

  return getSmsComplianceApproval(env, businessSmsComplianceStatus).approved;
}

export type SmsGateInput = {
  kind: SmsKind;
  consentStatus: SmsConsentStatus | null;
  optedOut?: boolean;
  suppressed: boolean;
  businessTimezone?: string | null;
  businessSmsComplianceStatus?: string | null;
  /** Prior outbound first_touch/followup messages already sent to this lead. */
  outboundSequenceCount?: number;
  now?: Date;
  env?: Record<string, string | undefined>;
};

export type SmsGateResult = { allowed: true } | { allowed: false; reason: string };

const MAX_SEQUENCE_MESSAGES = 4;
const QUIET_HOURS_START = 8; // inclusive, business-local
const QUIET_HOURS_END = 20; // exclusive — stop at 8pm as TCPA buffer

const blockedBy = (reason: string): SmsGateResult => ({ allowed: false, reason });

/**
 * Every outbound SMS passes through this gate before a live send. Order
 * matters: cheap env switches first, then opt-out/consent, then timing.
 * Callers log the reason on block so run output shows why a send was skipped.
 */
export function evaluateSmsSendGate(input: SmsGateInput): SmsGateResult {
  const env = input.env ?? process.env;

  if (!isTruthy(env.SMS_ENABLED)) return blockedBy("sms_disabled");
  if (((env.SMS_PROVIDER ?? "mock").trim().toLowerCase() || "mock") === "mock") {
    return blockedBy("provider_mock");
  }
  if (!getSmsComplianceApproval(env, input.businessSmsComplianceStatus).approved) {
    return blockedBy("compliance_not_approved");
  }

  // Opt-out is absolute. No message kind overrides it.
  if (input.suppressed) return blockedBy("suppressed");
  if (input.optedOut || input.consentStatus === "opted_out") return blockedBy("opted_out");

  // Business-initiated messages require documented opt-in. Only a direct
  // reply to an inbound message from the lead may go out on 'unknown'.
  if (input.kind !== "reply" && input.consentStatus !== "opted_in") {
    return blockedBy("no_documented_consent");
  }

  // Cap the follow-up sequence at the 1-4 messages/inquiry frequency
  // registered on the A2P campaign.
  if (
    (input.kind === "first_touch" || input.kind === "followup") &&
    (input.outboundSequenceCount ?? 0) >= MAX_SEQUENCE_MESSAGES
  ) {
    return blockedBy("sequence_exhausted");
  }

  // Quiet hours for business-initiated messages. TCPA window is 8am-9pm
  // recipient-local; we stop at 8pm and use the business timezone as the
  // proxy since local-service leads are local.
  if (input.kind !== "reply") {
    const timeZone = input.businessTimezone || env.BUSINESS_TIMEZONE || "America/Denver";
    const hour = getHourInTimezone(input.now ?? new Date(), timeZone);
    if (hour < QUIET_HOURS_START || hour >= QUIET_HOURS_END) {
      return blockedBy("quiet_hours");
    }
  }

  return { allowed: true };
}

export function getHourInTimezone(now: Date, timeZone: string): number {
  try {
    const value = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    }).format(now);
    const hour = Number.parseInt(value, 10);
    return Number.isNaN(hour) ? now.getUTCHours() : hour;
  } catch {
    return now.getUTCHours();
  }
}

export function validateTwilioSignature({
  authToken,
  url,
  params,
  signature,
}: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string | null;
}) {
  if (!signature) return false;

  const payload =
    url +
    Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key] ?? ""}`)
      .join("");
  const expected = createHmac("sha1", authToken).update(payload).digest("base64");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
