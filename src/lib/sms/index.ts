import { getSelectedSmsProviderName, getSmsProvider } from "@/lib/sms/provider";
import type { SendSmsInput, SendSmsResult, SmsProviderName } from "@/lib/sms/types";

export type {
  SendSmsInput,
  SendSmsResult,
  SmsProvider,
  SmsProviderName,
  SmsSendStatus,
} from "@/lib/sms/types";
export {
  getSelectedSmsProviderName,
  getSmsProvider,
  getSmsProviderLabel,
  isRealSmsProvider,
  normalizeSmsProviderName,
} from "@/lib/sms/provider";

export async function sendSms(
  input: SendSmsInput,
  options: { providerName?: SmsProviderName } = {}
): Promise<SendSmsResult> {
  const providerName = options.providerName ?? getSelectedSmsProviderName();
  const provider = getSmsProvider(providerName);
  return provider.sendSms(input);
}
