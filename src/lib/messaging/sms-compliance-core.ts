import { createHmac, timingSafeEqual } from "node:crypto";

export type SmsReadinessState =
  | "missing_config"
  | "configured_but_not_approved"
  | "approved_ready_for_manual_test"
  | "blocked"
  | "test_mode";

export type InboundSmsHandling = "normal_reply" | "opt_out" | "help";

export type SmsComplianceApproval = {
  approved: boolean;
  source: "env" | "a2p_status" | "business_status" | null;
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
  if (isHelpKeyword(body)) return "help";
  return "normal_reply";
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
  const campaignStatus = normalizeStatus(env.TWILIO_A2P_CAMPAIGN_STATUS);
  const businessStatus = normalizeStatus(businessSmsComplianceStatus);

  if (isTruthy(env.SMS_COMPLIANCE_APPROVED)) {
    return {
      approved: true,
      source: "env",
      campaignStatus,
      businessStatus,
    };
  }

  if (isApprovedStatus(campaignStatus)) {
    return {
      approved: true,
      source: "a2p_status",
      campaignStatus,
      businessStatus,
    };
  }

  if (isApprovedStatus(businessStatus)) {
    return {
      approved: true,
      source: "business_status",
      campaignStatus,
      businessStatus,
    };
  }

  return {
    approved: false,
    source: null,
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
