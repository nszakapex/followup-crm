import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getEmailProviderReadiness, shouldSkipReviewDelivery } from "@/lib/messaging/provider-config";
import type { DeliveryResult } from "@/lib/messaging/types";

interface SendEmailParams {
  businessId: string;
  leadId: string;
  to: string | null;
  subject: string;
  body: string;
  fromEmail?: string | null;
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

async function logEmailMessage({
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
    channel: "email",
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

function messageLogFailure(message: string): DeliveryResult {
  return {
    success: false,
    provider: "resend",
    providerMessageId: null,
    error: isDevelopment()
      ? `Failed to log email message: ${message}`
      : "Failed to log message.",
    userMessage: "Failed to log message.",
  };
}

/**
 * Sends an email review request through Resend when fully configured.
 *
 * Test/skip mode is checked before provider configuration and before any
 * network call, so local/demo smoke tests cannot accidentally send real email.
 */
export async function sendEmail(params: SendEmailParams): Promise<DeliveryResult> {
  const { businessId, leadId, to, subject, body, fromEmail } = params;
  const storedBody = `Subject: ${subject}\n\n${body}`;

  if (!to) {
    const userMessage = "Customer email is required for email review requests.";
    const messageError = await logEmailMessage({
      businessId,
      leadId,
      body: storedBody,
      status: "failed",
      provider: "resend",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure(messageError.message);

    return {
      success: false,
      provider: "resend",
      providerMessageId: null,
      error: userMessage,
      userMessage,
    };
  }

  if (!body.trim()) {
    const userMessage = "Review request message is required.";
    const messageError = await logEmailMessage({
      businessId,
      leadId,
      body: storedBody,
      status: "failed",
      provider: "resend",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure(messageError.message);

    return {
      success: false,
      provider: "resend",
      providerMessageId: null,
      error: userMessage,
      userMessage,
    };
  }

  if (shouldSkipReviewDelivery()) {
    const userMessage = "Review request created. Delivery skipped in test mode.";
    const messageError = await logEmailMessage({
      businessId,
      leadId,
      body: storedBody,
      status: "pending",
      provider: "test_mode",
    });

    if (messageError) {
      return {
        success: false,
        provider: "test_mode",
        providerMessageId: null,
        skipped: true,
        error: isDevelopment()
          ? `Failed to log email message: ${messageError.message}`
          : "Failed to log message.",
        userMessage: "Failed to log message.",
      };
    }

    return {
      success: true,
      provider: "test_mode",
      providerMessageId: null,
      skipped: true,
      userMessage,
    };
  }

  const readiness = getEmailProviderReadiness(fromEmail);

  if (!readiness.configured) {
    const userMessage = "Email provider is not configured.";
    const messageError = await logEmailMessage({
      businessId,
      leadId,
      body: storedBody,
      status: "failed",
      provider: "resend",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure(messageError.message);

    return {
      success: false,
      provider: "resend",
      providerMessageId: null,
      error: withDevDetail(userMessage, readiness.reason),
      userMessage,
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: readiness.fromEmail,
        to,
        subject,
        text: body,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!response.ok) {
      const userMessage = "Email delivery failed.";
      const detail = result.message || `Resend returned HTTP ${response.status}.`;
      const messageError = await logEmailMessage({
        businessId,
        leadId,
        body: storedBody,
        status: "failed",
        provider: "resend",
        errorMessage: userMessage,
      });

      if (messageError) return messageLogFailure(messageError.message);

      console.error("[messaging.email] Resend delivery failed", {
        businessId,
        leadId,
        status: response.status,
        detail,
      });

      return {
        success: false,
        provider: "resend",
        providerMessageId: null,
        error: withDevDetail(userMessage, detail),
        userMessage,
      };
    }

    const providerMessageId = result.id ?? null;
    const messageError = await logEmailMessage({
      businessId,
      leadId,
      body: storedBody,
      status: "sent",
      provider: "resend",
      providerMessageId,
    });

    if (messageError) return messageLogFailure(messageError.message);

    return {
      success: true,
      provider: "resend",
      providerMessageId,
      userMessage: "Review request sent.",
    };
  } catch (error) {
    const userMessage = "Email delivery failed.";
    const detail = error instanceof Error ? error.message : "Unknown Resend error.";
    const messageError = await logEmailMessage({
      businessId,
      leadId,
      body: storedBody,
      status: "failed",
      provider: "resend",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure(messageError.message);

    console.error("[messaging.email] Resend delivery exception", {
      businessId,
      leadId,
      detail,
    });

    return {
      success: false,
      provider: "resend",
      providerMessageId: null,
      error: withDevDetail(userMessage, detail),
      userMessage,
    };
  }
}
