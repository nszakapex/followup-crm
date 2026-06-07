import { mockSmsProvider } from "@/lib/sms/providers/mock";
import { twilioSmsProvider } from "@/lib/sms/providers/twilio";
import type { SendSmsResult, SmsProvider, SmsProviderName } from "@/lib/sms/types";

type EnvLike = Record<string, string | undefined>;

const PROVIDER_NAMES = new Set<SmsProviderName>(["mock", "twilio", "telnyx", "plivo"]);

export function normalizeSmsProviderName(value: string | null | undefined): SmsProviderName | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return PROVIDER_NAMES.has(normalized as SmsProviderName) ? (normalized as SmsProviderName) : null;
}

export function getSelectedSmsProviderName(
  env: EnvLike = process.env
): SmsProviderName {
  return normalizeSmsProviderName(env.SMS_PROVIDER) ?? "mock";
}

export function isRealSmsProvider(provider: SmsProviderName) {
  return provider !== "mock";
}

export function getSmsProviderLabel(provider: SmsProviderName) {
  switch (provider) {
    case "twilio":
      return "Twilio SMS";
    case "telnyx":
      return "Telnyx SMS";
    case "plivo":
      return "Plivo SMS";
    case "mock":
    default:
      return "Mock SMS";
  }
}

export function getSmsProvider(provider: SmsProviderName): SmsProvider {
  switch (provider) {
    case "twilio":
      return twilioSmsProvider;
    case "telnyx":
      return createUnavailableProvider("telnyx", "Telnyx SMS provider is not implemented yet.");
    case "plivo":
      return createUnavailableProvider("plivo", "Plivo SMS provider is not implemented yet.");
    case "mock":
    default:
      return mockSmsProvider;
  }
}

function createUnavailableProvider(
  provider: SmsProviderName,
  message: string
): SmsProvider {
  return {
    name: provider,
    async sendSms(): Promise<SendSmsResult> {
      return {
        provider,
        status: "failed",
        errorCode: "provider_not_implemented",
        errorMessage: message,
      };
    },
  };
}
