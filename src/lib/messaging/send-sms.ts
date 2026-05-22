import "server-only";

import { createClient } from "@supabase/supabase-js";

interface SendSmsParams {
  businessId: string;
  leadId: string;
  to: string;
  body: string;
  optedOut: boolean;
  twilioFromNumber?: string | null;
}

interface SendSmsResult {
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

function hasTwilioConfig(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
}

function getMessageLogError(errorMessage: string) {
  return process.env.NODE_ENV !== "production"
    ? `Failed to log SMS message: ${errorMessage}`
    : "Failed to log message.";
}

/**
 * Send an SMS message. Falls back to mock if Twilio is not configured.
 *
 * - Blocks outbound if the lead has opted out.
 * - Logs the message to the messages table regardless of provider.
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const { businessId, leadId, to, body, optedOut, twilioFromNumber } = params;
  const supabase = createServiceClient();

  // Block if opted out
  if (optedOut) {
    const { error: messageInsertError } = await supabase.from("messages").insert({
      business_id: businessId,
      lead_id: leadId,
      channel: "sms",
      direction: "outbound",
      body,
      status: "failed",
      provider: "blocked",
      error_message: "Lead has opted out of SMS",
    });

    if (messageInsertError) {
      return {
        success: false,
        provider: "blocked",
        providerMessageId: null,
        error: getMessageLogError(messageInsertError.message),
      };
    }

    return {
      success: false,
      provider: "blocked",
      providerMessageId: null,
      error: "Lead has opted out of SMS. Message was not sent.",
    };
  }

  // Use real Twilio if configured
  if (hasTwilioConfig()) {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID!;
      const authToken = process.env.TWILIO_AUTH_TOKEN!;
      const from =
        twilioFromNumber ||
        process.env.TWILIO_PHONE_NUMBER ||
        undefined;
      const messagingServiceSid =
        process.env.TWILIO_MESSAGING_SERVICE_SID || undefined;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

      const formBody = new URLSearchParams();
      formBody.append("To", to);
      formBody.append("Body", body);
      if (messagingServiceSid) {
        formBody.append("MessagingServiceSid", messagingServiceSid);
      } else if (from) {
        formBody.append("From", from);
      }

      const response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody.toString(),
      });

      const result = await response.json();

      if (!response.ok) {
        const { error: messageInsertError } = await supabase.from("messages").insert({
          business_id: businessId,
          lead_id: leadId,
          channel: "sms",
          direction: "outbound",
          body,
          status: "failed",
          provider: "twilio",
          error_message: result.message || "Twilio API error",
          sent_at: new Date().toISOString(),
        });

        if (messageInsertError) {
          return {
            success: false,
            provider: "twilio",
            providerMessageId: null,
            error: getMessageLogError(messageInsertError.message),
          };
        }

        return {
          success: false,
          provider: "twilio",
          providerMessageId: null,
          error: result.message || "Twilio API error",
        };
      }

      const { error: messageInsertError } = await supabase.from("messages").insert({
        business_id: businessId,
        lead_id: leadId,
        channel: "sms",
        direction: "outbound",
        body,
        status: "sent",
        provider: "twilio",
        provider_message_id: result.sid,
        sent_at: new Date().toISOString(),
      });

      if (messageInsertError) {
        return {
          success: false,
          provider: "twilio",
          providerMessageId: result.sid,
          error: getMessageLogError(messageInsertError.message),
        };
      }

      return {
        success: true,
        provider: "twilio",
        providerMessageId: result.sid,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown Twilio error";

      const { error: messageInsertError } = await supabase.from("messages").insert({
        business_id: businessId,
        lead_id: leadId,
        channel: "sms",
        direction: "outbound",
        body,
        status: "failed",
        provider: "twilio",
        error_message: errorMsg,
      });

      if (messageInsertError) {
        return {
          success: false,
          provider: "twilio",
          providerMessageId: null,
          error: getMessageLogError(messageInsertError.message),
        };
      }

      return {
        success: false,
        provider: "twilio",
        providerMessageId: null,
        error: errorMsg,
      };
    }
  }

  // Mock fallback — no real SMS sent
  const mockId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const { error: messageInsertError } = await supabase.from("messages").insert({
    business_id: businessId,
    lead_id: leadId,
    channel: "sms",
    direction: "outbound",
    body,
    status: "sent",
    provider: "mock_twilio",
    provider_message_id: mockId,
    sent_at: new Date().toISOString(),
  });

  if (messageInsertError) {
    return {
      success: false,
      provider: "mock_twilio",
      providerMessageId: null,
      error: getMessageLogError(messageInsertError.message),
    };
  }

  return {
    success: true,
    provider: "mock_twilio",
    providerMessageId: mockId,
  };
}
