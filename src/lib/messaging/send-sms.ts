import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  getSmsProviderReadiness,
  isSmsEnabled,
  shouldSkipReviewDelivery,
} from "@/lib/messaging/provider-config";
import { isValidSmsDestination } from "@/lib/messaging/sms-compliance-core";
import type { DeliveryResult } from "@/lib/messaging/types";
import { sendSms as sendSmsViaProvider } from "@/lib/sms";

interface SendSmsParams {
  businessId: string;
  leadId: string;
  to: string | null;
  body: string;
  optedOut: boolean;
  smsFromNumber?: string | null;
  smsComplianceStatus?: string | null;
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
  if (isDevelopment()) {
    console.warn("[messaging.sms] Failed to log SMS message", { message });
  }

  return {
    success: false,
    provider,
    providerMessageId: null,
    error: "Failed to log message.",
    userMessage: "Failed to log message.",
  };
}

/**
 * Sends or records an SMS review request through the selected SMS provider.
 *
 * Test/skip mode is checked before provider configuration and before any
 * network call, so local/demo smoke tests cannot accidentally send real SMS.
 */
export async function sendSms(params: SendSmsParams): Promise<DeliveryResult> {
  const { businessId, leadId, to, body, optedOut, smsFromNumber, smsComplianceStatus } =
    params;

  if (!isSmsEnabled()) {
    const userMessage = "SMS is disabled for this deployment.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "disabled",
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

  if (!to) {
    const userMessage = "Customer phone number is required for SMS review requests.";
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
      provider: "blocked",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("blocked", messageError.message);

    return {
      success: false,
      provider: "blocked",
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

  if (!isValidSmsDestination(to)) {
    const userMessage = "Customer phone number must be a valid SMS destination.";
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

  const readiness = getSmsProviderReadiness(smsFromNumber, smsComplianceStatus);

  if (readiness.provider === "mock") {
    const userMessage = "SMS mock delivery recorded. No live message was sent.";
    const providerResult = await sendSmsViaProvider(
      {
        businessId,
        leadId,
        to,
        body,
      },
      { providerName: "mock" }
    );
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "pending",
      provider: "mock",
      providerMessageId: providerResult.providerMessageId ?? null,
    });

    if (messageError) return messageLogFailure("mock", messageError.message);

    return {
      success: true,
      provider: "mock",
      providerMessageId: providerResult.providerMessageId ?? null,
      providerStatus: providerResult.status,
      skipped: true,
      userMessage,
    };
  }

  if (!readiness.configured || !readiness.canAttemptLiveSend) {
    const userMessage =
      readiness.reason ??
      (readiness.complianceApproved
        ? "SMS provider is not configured."
        : "SMS compliance approval is not recorded yet. No SMS was sent.");
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

  const providerResult = await sendSmsViaProvider(
    {
      businessId,
      leadId,
      to,
      from: readiness.sender,
      body,
    },
    { providerName: readiness.provider }
  );

  if (providerResult.status === "failed") {
    const userMessage = "SMS delivery failed.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: providerResult.provider,
      providerMessageId: providerResult.providerMessageId ?? null,
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure(providerResult.provider, messageError.message);

    return {
      success: false,
      provider: providerResult.provider,
      providerMessageId: providerResult.providerMessageId ?? null,
      providerStatus: "failed",
      error: userMessage,
      userMessage,
    };
  }

  const messageStatus =
    providerResult.status === "delivered" || providerResult.status === "sent" ? "sent" : "pending";
  const messageError = await logSmsMessage({
    businessId,
    leadId,
    body,
    status: messageStatus,
    provider: providerResult.provider,
    providerMessageId: providerResult.providerMessageId ?? null,
  });

  if (messageError) return messageLogFailure(providerResult.provider, messageError.message);

  return {
    success: true,
    provider: providerResult.provider,
    providerMessageId: providerResult.providerMessageId ?? null,
    providerStatus: providerResult.status,
    userMessage: "Review request sent.",
  };
}
