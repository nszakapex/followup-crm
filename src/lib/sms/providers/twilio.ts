import { formatSmsDestinationForProvider } from "@/lib/messaging/sms-compliance-core";
import type { SendSmsResult, SmsProvider } from "@/lib/sms/types";

type TwilioApiResponse = {
  sid?: string;
  status?: string;
  code?: number | string;
  message?: string;
};

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const envFromNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;

  return {
    accountSid,
    authToken,
    messagingServiceSid,
    envFromNumber,
    configured: Boolean(accountSid && authToken && (messagingServiceSid || envFromNumber)),
  };
}

export const twilioSmsProvider: SmsProvider = {
  name: "twilio",
  async sendSms(input): Promise<SendSmsResult> {
    const config = getTwilioConfig();

    if (!config.accountSid || !config.authToken) {
      return {
        provider: "twilio",
        status: "failed",
        errorCode: "missing_credentials",
        errorMessage: "Twilio SMS provider is missing required credentials.",
      };
    }

    if (!config.messagingServiceSid && !input.from && !config.envFromNumber) {
      return {
        provider: "twilio",
        status: "failed",
        errorCode: "missing_sender",
        errorMessage: "Twilio SMS provider is missing a messaging service or sender number.",
      };
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
    const formBody = new URLSearchParams();

    formBody.append("To", formatSmsDestinationForProvider(input.to));
    formBody.append("Body", input.body);

    if (config.messagingServiceSid) {
      formBody.append("MessagingServiceSid", config.messagingServiceSid);
    } else {
      formBody.append("From", input.from || config.envFromNumber!);
    }

    try {
      const response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString(
            "base64"
          )}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody.toString(),
      });
      const result = (await response.json().catch(() => ({}))) as TwilioApiResponse;

      if (!response.ok) {
        console.error("[sms.twilio] SMS delivery failed", {
          businessId: input.businessId,
          leadId: input.leadId,
          status: response.status,
          providerCode: result.code ?? null,
        });

        return {
          provider: "twilio",
          providerMessageId: null,
          status: "failed",
          errorCode: result.code ? String(result.code) : `http_${response.status}`,
          errorMessage: "Twilio SMS provider rejected the send attempt.",
          raw: {
            httpStatus: response.status,
            providerStatus: result.status ?? null,
            providerCode: result.code ?? null,
          },
        };
      }

      return {
        provider: "twilio",
        providerMessageId: result.sid ?? null,
        status: normalizeTwilioStatus(result.status),
        raw: {
          providerStatus: result.status ?? null,
        },
      };
    } catch (error) {
      console.error("[sms.twilio] SMS delivery exception", {
        businessId: input.businessId,
        leadId: input.leadId,
        errorName: error instanceof Error ? error.name : "unknown",
      });

      return {
        provider: "twilio",
        providerMessageId: null,
        status: "failed",
        errorCode: "provider_exception",
        errorMessage: "Twilio SMS provider failed during the send attempt.",
      };
    }
  },
};

function normalizeTwilioStatus(status: string | undefined): SendSmsResult["status"] {
  switch (status?.toLowerCase()) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "failed":
    case "undelivered":
      return "failed";
    default:
      return "queued";
  }
}
