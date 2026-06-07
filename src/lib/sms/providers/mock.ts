import type { SendSmsInput, SendSmsResult, SmsProvider } from "@/lib/sms/types";

function createMockMessageId(input: SendSmsInput) {
  const leadPart = input.leadId ? input.leadId.slice(0, 8) : "manual";
  return `mock_sms_${leadPart}_${Date.now()}`;
}

export const mockSmsProvider: SmsProvider = {
  name: "mock",
  async sendSms(input): Promise<SendSmsResult> {
    return {
      provider: "mock",
      providerMessageId: createMockMessageId(input),
      status: "mocked",
      raw: {
        mocked: true,
      },
    };
  },
};
