import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSmsProviderReadiness, shouldSkipReviewDelivery } from "@/lib/messaging/provider-config";
import type { DeliveryResult } from "@/lib/messaging/types";

interface SendSmsParams {
  businessId: string;
  leadId: string;
  to: string | null;
  body: string;
  optedOut: boolean;
  twilioFromNumber?: string | null;
}

type MessageStatus = "pending" | "sent" | "delivered" | "failed" | "received";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function withDevDetail(userMessage: string, detail?: string | null) {
  return isDevelopment() && detail ? `${userMessage} ${detail}` : userMessage;
}

async function logSmsMessage({
  businessId,
  leadId,
  body,
  status,
  provider,
  providerMessageId = null,
  errorMessage = null,
}: {
  businessId: string;
  leadId: string;
  body: string;
  status: MessageStatus;
  provider: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("messages").insert({
    business_id: businessId,
    lead_id: leadId,
    channel: "sms",
    direction: "outbound",
    body,
    status,
    provider,
    provider_message_id: providerMessageId,
    error_message: errorMessage,
    sent_at: status === "sent" || status === "failed" ? new Date().toISOString() : null,
  });

  return error;
}

function messageLogFailure(provider: DeliveryResult["provider"], message: string): DeliveryResult {
  return {
    success: false,
    provider,
    providerMessageId: null,
    error: isDevelopment()
      ? `Failed to log SMS message: ${message}`
      : "Failed to log message.",
    userMessage: "Failed to log message.",
  };
}

/**
 * Sends an SMS review request through Twilio when fully configured.
 *
 * Test/skip mode is checked before provider configuration and before any
 * network call, so local/demo smoke tests cannot accidentally send real SMS.
 */
export async function sendSms(params: SendSmsParams): Promise<DeliveryResult> {
  const { businessId, leadId, to, body, optedOut, twilioFromNumber } = params;

  if (!to) {
    const userMessage = "Customer phone number is required for SMS review requests.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "twilio",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("twilio", messageError.message);

    return {
      success: false,
      provider: "twilio",
      providerMessageId: null,
      providerStatus: "blocked",
      error: userMessage,
      userMessage,
    };
  }

  if (!body.trim()) {
    const userMessage = "Review request message is required.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "twilio",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("twilio", messageError.message);

    return {
      success: false,
      provider: "twilio",
      providerMessageId: null,
      providerStatus: "blocked",
      error: userMessage,
      userMessage,
    };
  }

  if (optedOut) {
    const userMessage = "This customer has opted out of review requests.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "blocked",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("blocked", messageError.message);

    return {
      success: false,
      provider: "blocked",
      providerMessageId: null,
      providerStatus: "blocked",
      skipped: true,
      error: userMessage,
      userMessage,
    };
  }

  if (shouldSkipReviewDelivery()) {
    const userMessage = "Review request created. Delivery skipped in test mode.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "pending",
      provider: "test_mode",
    });

    if (messageError) return messageLogFailure("test_mode", messageError.message);

    return {
      success: true,
      provider: "test_mode",
      providerMessageId: null,
      providerStatus: "skipped",
      skipped: true,
      userMessage,
    };
  }

  const readiness = getSmsProviderReadiness(twilioFromNumber);

  if (!readiness.configured) {
    const userMessage = "SMS provider is not configured.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "twilio",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("twilio", messageError.message);

    return {
      success: false,
      provider: "twilio",
      providerMessageId: null,
      providerStatus: "blocked",
      error: withDevDetail(userMessage, readiness.reason),
      userMessage,
    };
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const formBody = new URLSearchParams();

    formBody.append("To", to);
    formBody.append("Body", body);

    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      formBody.append("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
    } else if (readiness.sender) {
      formBody.append("From", readiness.sender);
    }

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });
    const result = (await response.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      message?: string;
    };

    if (!response.ok) {
      const userMessage = "SMS delivery failed.";
      const detail = result.message || `Twilio returned HTTP ${response.status}.`;
      const messageError = await logSmsMessage({
        businessId,
        leadId,
        body,
        status: "failed",
        provider: "twilio",
        errorMessage: userMessage,
      });

      if (messageError) return messageLogFailure("twilio", messageError.message);

      console.error("[messaging.sms] Twilio delivery failed", {
        businessId,
        leadId,
        status: response.status,
        detail,
      });

      return {
        success: false,
        provider: "twilio",
        providerMessageId: null,
        providerStatus: "failed",
        error: withDevDetail(userMessage, detail),
        userMessage,
      };
    }

    const providerMessageId = result.sid ?? null;
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "sent",
      provider: "twilio",
      providerMessageId,
    });

    if (messageError) return messageLogFailure("twilio", messageError.message);

    return {
      success: true,
      provider: "twilio",
      providerMessageId,
      providerStatus: result.status ?? "queued",
      userMessage: "Review request sent.",
    };
  } catch (error) {
    const userMessage = "SMS delivery failed.";
    const detail = error instanceof Error ? error.message : "Unknown Twilio error.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "twilio",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("twilio", messageError.message);

    console.error("[messaging.sms] Twilio delivery exception", {
      businessId,
      leadId,
      detail,
    });

    return {
      success: false,
      provider: "twilio",
      providerMessageId: null,
      providerStatus: "failed",
      error: withDevDetail(userMessage, detail),
      userMessage,
    };
  }
}
