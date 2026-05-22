export type DeliveryProvider = "twilio" | "resend" | "test_mode" | "blocked";

export type DeliveryResult =
  | {
      success: true;
      provider: DeliveryProvider;
      providerMessageId: string | null;
      skipped?: boolean;
      userMessage: string;
    }
  | {
      success: false;
      provider: DeliveryProvider;
      providerMessageId: string | null;
      skipped?: boolean;
      error: string;
      userMessage: string;
    };
