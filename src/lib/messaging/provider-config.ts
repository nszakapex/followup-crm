import "server-only";

export type SmsProviderReadiness = {
  configured: boolean;
  accountConfigured: boolean;
  usesMessagingService: boolean;
  senderConfigured: boolean;
  senderSource: "business" | "env" | null;
  sender: string | null;
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
  businessTwilioFromNumber?: string | null
): SmsProviderReadiness {
  const accountConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  );
  const usesMessagingService = Boolean(process.env.TWILIO_MESSAGING_SERVICE_SID);
  const envSender = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || null;
  const sender = businessTwilioFromNumber || envSender;
  const senderSource = businessTwilioFromNumber ? "business" : envSender ? "env" : null;
  const senderConfigured = Boolean(sender);
  const configured = accountConfigured && (usesMessagingService || senderConfigured);
  const reason = !accountConfigured
    ? "Missing Twilio account SID or auth token."
    : !usesMessagingService && !senderConfigured
      ? "Missing Twilio messaging service SID or from number."
      : null;

  return {
    configured,
    accountConfigured,
    usesMessagingService,
    senderConfigured,
    senderSource,
    sender,
    reason,
  };
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
