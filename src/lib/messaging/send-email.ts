import "server-only";

import { createClient } from "@supabase/supabase-js";

interface SendEmailParams {
  businessId: string;
  leadId: string;
  to: string;
  subject: string;
  body: string;
  fromEmail?: string | null;
}

interface SendEmailResult {
  success: boolean;
  provider: string;
  providerMessageId: string | null;
  error?: string;
}

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function hasResendConfig(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Send an email. Falls back to mock if Resend is not configured.
 *
 * Logs the message to the messages table regardless of provider.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { businessId, leadId, to, subject, body, fromEmail } = params;
  const supabase = createServiceClient();

  // Use real Resend if configured
  if (hasResendConfig()) {
    try {
      const from =
        fromEmail ||
        process.env.RESEND_FROM_EMAIL ||
        "noreply@example.com";

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          subject,
          text: body,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        await supabase.from("messages").insert({
          business_id: businessId,
          lead_id: leadId,
          channel: "email",
          direction: "outbound",
          body: `Subject: ${subject}\n\n${body}`,
          status: "failed",
          provider: "resend",
          error_message: result.message || "Resend API error",
          sent_at: new Date().toISOString(),
        });

        return {
          success: false,
          provider: "resend",
          providerMessageId: null,
          error: result.message || "Resend API error",
        };
      }

      await supabase.from("messages").insert({
        business_id: businessId,
        lead_id: leadId,
        channel: "email",
        direction: "outbound",
        body: `Subject: ${subject}\n\n${body}`,
        status: "sent",
        provider: "resend",
        provider_message_id: result.id,
        sent_at: new Date().toISOString(),
      });

      return {
        success: true,
        provider: "resend",
        providerMessageId: result.id,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown Resend error";

      await supabase.from("messages").insert({
        business_id: businessId,
        lead_id: leadId,
        channel: "email",
        direction: "outbound",
        body: `Subject: ${subject}\n\n${body}`,
        status: "failed",
        provider: "resend",
        error_message: errorMsg,
      });

      return {
        success: false,
        provider: "resend",
        providerMessageId: null,
        error: errorMsg,
      };
    }
  }

  // Mock fallback — no real email sent
  const mockId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await supabase.from("messages").insert({
    business_id: businessId,
    lead_id: leadId,
    channel: "email",
    direction: "outbound",
    body: `Subject: ${subject}\n\n${body}`,
    status: "sent",
    provider: "mock_resend",
    provider_message_id: mockId,
    sent_at: new Date().toISOString(),
  });

  return {
    success: true,
    provider: "mock_resend",
    providerMessageId: mockId,
  };
}
