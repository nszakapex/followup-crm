export type SmsProviderName = "mock" | "twilio" | "telnyx" | "plivo";

export type SmsSendStatus = "queued" | "sent" | "delivered" | "failed" | "mocked";

export type SendSmsInput = {
  to: string;
  from?: string | null;
  body: string;
  businessId?: string;
  customerId?: string;
  leadId?: string;
  metadata?: Record<string, unknown>;
};

export type SendSmsResult = {
  provider: SmsProviderName;
  providerMessageId?: string | null;
  status: SmsSendStatus;
  errorCode?: string;
  /** Provider numeric error code when available (e.g. Twilio 21610). */
  providerErrorCode?: number | null;
  /** True when retrying the same number is pointless (invalid, opted out, landline). */
  permanentFailure?: boolean;
  errorMessage?: string;
  raw?: Record<string, unknown>;
};

export type SmsProvider = {
  name: SmsProviderName;
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
};
