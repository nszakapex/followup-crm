// Kept free of "server-only" so tests can exercise the readiness gates (same
// pattern as twilio-webhooks.ts). Only ever reads process.env - importing it
// from a client component would silently see undefined vars, so don't.

import {
  getSmsComplianceApproval,
  getSmsReadinessState,
  type SmsReadinessState,
} from "@/lib/messaging/sms-compliance-core";
import {
  getSelectedSmsProviderName,
  getSmsProviderLabel,
  isRealSmsProvider,
} from "@/lib/sms/provider";
import type { SmsProviderName } from "@/lib/sms/types";

export type SmsProviderReadiness = {
  enabled: boolean;
  provider: SmsProviderName;
  providerLabel: string;
  mockMode: boolean;
  configured: boolean;
  accountConfigured: boolean;
  usesMessagingService: boolean;
  senderConfigured: boolean;
  senderSource: "business" | "env" | null;
  sender: string | null;
  complianceApproved: boolean;
  complianceSource: "env" | "compliance_status" | "a2p_status" | "business_status" | null;
  complianceStatus: string | null;
  businessComplianceStatus: string | null;
  a2pCampaignStatus: string | null;
  state: SmsReadinessState;
  canAttemptLiveSend: boolean;
  reason: string | null;
};

export type EmailProviderReadiness = {
  configured: boolean;
  apiKeyConfigured: boolean;
  fromConfigured: boolean;
  fromSource: "business" | "env" | null;
  fromEmail: string | null;
  reason: string | null;
};

export function isDeliveryTestMode() {
  return isTruthy(process.env.REVIEW_REQUEST_TEST_MODE);
}

export function isDeliverySkipMode() {
  return isTruthy(process.env.REVIEW_REQUEST_SKIP_DELIVERY);
}

export function isSmsEnabled(env: Record<string, string | undefined> = process.env) {
  return isTruthy(env.SMS_ENABLED);
}

export function shouldSkipReviewDelivery() {
  if (isDeliveryTestMode() || isDeliverySkipMode()) return true;

  return (
    process.env.NODE_ENV !== "production" &&
    !isExplicitlyFalse(process.env.REVIEW_REQUEST_TEST_MODE) &&
    !isExplicitlyFalse(process.env.REVIEW_REQUEST_SKIP_DELIVERY)
  );
}

export function getDeliveryModeLabel() {
  if (isDeliverySkipMode()) return "Delivery skipped";
  if (isDeliveryTestMode()) return "Test mode";
  if (shouldSkipReviewDelivery()) return "Development skip mode";
  return "Live delivery";
}

export function getSmsProviderReadiness(
  businessSmsFromNumber?: string | null,
  businessSmsComplianceStatus?: string | null
): SmsProviderReadiness {
  const smsEnabled = isSmsEnabled();
  const provider = getSelectedSmsProviderName();
  const providerLabel = getSmsProviderLabel(provider);
  const mockMode = provider === "mock";
  const envSender = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || null;
  const sender = businessSmsFromNumber || envSender;
  const senderSource = businessSmsFromNumber ? "business" : envSender ? "env" : null;
  const twilioAccountConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  );
  const twilioUsesMessagingService = Boolean(process.env.TWILIO_MESSAGING_SERVICE_SID);
  const twilioSenderConfigured = Boolean(sender);
  const twilioConfigured =
    twilioAccountConfigured && (twilioUsesMessagingService || twilioSenderConfigured);

  const accountConfigured =
    provider === "twilio" ? twilioAccountConfigured : provider === "mock" ? true : false;
  const usesMessagingService = provider === "twilio" ? twilioUsesMessagingService : false;
  const senderConfigured =
    provider === "twilio" ? twilioSenderConfigured : provider === "mock" ? true : false;
  const configured = smsEnabled
    ? provider === "twilio"
      ? twilioConfigured
      : provider === "mock"
        ? true
        : false
    : false;
  const compliance = getSmsComplianceApproval(process.env, businessSmsComplianceStatus);
  const deliverySkipped = shouldSkipReviewDelivery();
  const canAttemptLiveSend =
    smsEnabled &&
    isRealSmsProvider(provider) &&
    configured &&
    compliance.approved &&
    !deliverySkipped;
  const state =
    !smsEnabled
      ? "blocked"
      : mockMode && !deliverySkipped
      ? "blocked"
      : getSmsReadinessState({
          deliverySkipped,
          providerConfigured: isRealSmsProvider(provider) ? configured : false,
          complianceApproved: compliance.approved,
        });
  const reason = getSmsReadinessReason({
    provider,
    providerLabel,
    smsEnabled,
    accountConfigured,
    usesMessagingService,
    senderConfigured,
    complianceApproved: compliance.approved,
    deliverySkipped,
  });

  return {
    enabled: smsEnabled,
    provider,
    providerLabel,
    mockMode,
    configured,
    accountConfigured,
    usesMessagingService,
    senderConfigured,
    senderSource,
    sender,
    complianceApproved: compliance.approved,
    complianceSource: compliance.source,
    complianceStatus: compliance.complianceStatus,
    businessComplianceStatus: compliance.businessStatus,
    a2pCampaignStatus: compliance.campaignStatus,
    state,
    canAttemptLiveSend,
    reason,
  };
}

function getSmsReadinessReason({
  provider,
  providerLabel,
  smsEnabled,
  accountConfigured,
  usesMessagingService,
  senderConfigured,
  complianceApproved,
  deliverySkipped,
}: {
  provider: SmsProviderName;
  providerLabel: string;
  smsEnabled: boolean;
  accountConfigured: boolean;
  usesMessagingService: boolean;
  senderConfigured: boolean;
  complianceApproved: boolean;
  deliverySkipped: boolean;
}) {
  if (!smsEnabled) return "SMS is disabled by SMS_ENABLED=false.";
  if (deliverySkipped) return null;
  if (provider === "mock") {
    return "Mock SMS provider records SMS attempts only. Select a live SMS provider before live SMS.";
  }
  if (provider === "telnyx" || provider === "plivo") {
    return `${providerLabel} adapter is not implemented yet.`;
  }
  if (!accountConfigured) return "Missing Twilio account SID or auth token.";
  if (!usesMessagingService && !senderConfigured) {
    return "Missing Twilio messaging service SID or from number.";
  }
  if (!complianceApproved) return "SMS compliance approval is not recorded yet.";
  return null;
}

export function getEmailProviderReadiness(
  businessFromEmail?: string | null
): EmailProviderReadiness {
  const apiKeyConfigured = Boolean(process.env.RESEND_API_KEY);
  const envFromEmail = process.env.RESEND_FROM_EMAIL || null;
  const fromEmail = businessFromEmail || envFromEmail;
  const fromSource = businessFromEmail ? "business" : envFromEmail ? "env" : null;
  const fromConfigured = Boolean(fromEmail);
  const configured = apiKeyConfigured && fromConfigured;
  const reason = !apiKeyConfigured
    ? "Missing Resend API key."
    : !fromConfigured
      ? "Missing Resend from email."
      : null;

  return {
    configured,
    apiKeyConfigured,
    fromConfigured,
    fromSource,
    fromEmail,
    reason,
  };
}

function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function isExplicitlyFalse(value: string | undefined) {
  return ["0", "false", "no", "off"].includes((value ?? "").toLowerCase());
}
