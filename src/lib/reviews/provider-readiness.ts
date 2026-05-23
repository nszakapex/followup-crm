import "server-only";

import {
  getEmailProviderReadiness,
  getSmsProviderReadiness,
  isDeliverySkipMode,
  isDeliveryTestMode,
  shouldSkipReviewDelivery,
} from "@/lib/messaging/provider-config";

export type ReviewSendMode = "live" | "test" | "skip" | "blocked";
export type ReviewProviderChannel = "sms" | "email";
export type ReviewProviderCodePath =
  | "direct_manual"
  | "automation_action_manual"
  | "automation_run"
  | "scheduled_run";

export type ReviewProviderReadiness = {
  ready: boolean;
  mode: ReviewSendMode;
  providerLabel: string;
  safeReason: string;
  missingFields: string[];
  warnings: string[];
  canAttemptProviderSend: boolean;
  requiresManualConfirmation: boolean;
  userFacingExplanation: string;
};

type BusinessProviderSettings = {
  id: string | null;
  google_review_link: string | null;
  twilio_from_number: string | null;
  resend_from_email: string | null;
};

type ProviderReadinessParams = {
  business: BusinessProviderSettings | null;
  channel: ReviewProviderChannel;
  codePath: ReviewProviderCodePath;
  requireReviewLink?: boolean;
};

function hasUrlLikeValue(value: string | null | undefined) {
  if (!value?.trim()) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getMode(): Exclude<ReviewSendMode, "blocked"> {
  if (isDeliverySkipMode()) return "skip";
  if (isDeliveryTestMode() || shouldSkipReviewDelivery()) return "test";
  return "live";
}

export function getReviewProviderReadiness({
  business,
  channel,
  codePath,
  requireReviewLink = true,
}: ProviderReadinessParams): ReviewProviderReadiness {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  const providerLabel = channel === "sms" ? "Twilio SMS" : "Resend email";
  const scheduledCodePath = codePath === "automation_run" || codePath === "scheduled_run";

  if (!business?.id) missingFields.push("Business");

  if (requireReviewLink) {
    if (!business?.google_review_link?.trim()) {
      missingFields.push("Google review link");
    } else if (!hasUrlLikeValue(business.google_review_link)) {
      warnings.push("Review link should be a valid http or https URL.");
    }
  }

  if (scheduledCodePath) {
    return {
      ready: false,
      mode: "blocked",
      providerLabel,
      safeReason: "Scheduled automation routes are not allowed to attempt provider sends.",
      missingFields,
      warnings,
      canAttemptProviderSend: false,
      requiresManualConfirmation: false,
      userFacingExplanation:
        "Scheduled checks can create pending actions, but they cannot send provider messages.",
    };
  }

  const mode = getMode();

  if (mode === "skip") {
    return {
      ready: missingFields.length === 0,
      mode,
      providerLabel,
      safeReason:
        missingFields.length > 0
          ? `${missingFields.join(", ")} missing.`
          : "Skip mode is active.",
      missingFields,
      warnings,
      canAttemptProviderSend: false,
      requiresManualConfirmation: false,
      userFacingExplanation:
        missingFields.length > 0
          ? "Review request setup is incomplete. No live provider message will be sent."
          : "Skip mode is active. A request may be recorded, but no provider message will be sent.",
    };
  }

  if (mode === "test") {
    return {
      ready: missingFields.length === 0,
      mode,
      providerLabel,
      safeReason:
        missingFields.length > 0
          ? `${missingFields.join(", ")} missing.`
          : "Test mode is active.",
      missingFields,
      warnings,
      canAttemptProviderSend: false,
      requiresManualConfirmation: false,
      userFacingExplanation:
        missingFields.length > 0
          ? "Review request setup is incomplete. Test mode will not send a live provider message."
          : "Test mode is active. A request may be created, but no live provider message will be sent.",
    };
  }

  const providerReadiness =
    channel === "sms"
      ? getSmsProviderReadiness(business?.twilio_from_number)
      : getEmailProviderReadiness(business?.resend_from_email);

  if (!providerReadiness.configured) {
    missingFields.push(channel === "sms" ? "SMS provider configuration" : "Email provider configuration");
  }

  if (missingFields.length > 0) {
    return {
      ready: false,
      mode: "blocked",
      providerLabel,
      safeReason:
        providerReadiness.reason ??
        `${missingFields.join(", ")} missing.`,
      missingFields,
      warnings,
      canAttemptProviderSend: false,
      requiresManualConfirmation: true,
      userFacingExplanation:
        channel === "sms"
          ? "Blocked — SMS provider or review setup is incomplete. No message will be sent."
          : "Blocked — email provider or review setup is incomplete. No message will be sent.",
    };
  }

  return {
    ready: true,
    mode: "live",
    providerLabel,
    safeReason: "Live provider configuration is present.",
    missingFields,
    warnings,
    canAttemptProviderSend: true,
    requiresManualConfirmation: true,
    userFacingExplanation:
      channel === "sms"
        ? "Live send ready — this will send a real SMS after confirmation."
        : "Live send ready — this will send a real email after confirmation.",
  };
}
