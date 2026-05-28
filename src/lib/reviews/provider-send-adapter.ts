import "server-only";

import { sendEmail } from "@/lib/messaging/send-email";
import { sendSms } from "@/lib/messaging/send-sms";
import type { DeliveryResult } from "@/lib/messaging/types";

type ReviewProviderSendInput = {
  businessId: string;
  leadId: string;
  channel: "sms" | "email";
  phone: string | null;
  email: string | null;
  messageBody: string;
  businessName: string;
  optedOut: boolean;
  twilioFromNumber?: string | null;
  smsComplianceStatus?: string | null;
  resendFromEmail?: string | null;
};

/**
 * Server-only boundary for a single manual review request provider attempt.
 *
 * This adapter deliberately delegates to the existing SMS/email helpers so
 * readiness, skip/test mode, message logging, and provider normalization stay
 * consistent across manual direct sends and approved automation actions.
 */
export async function sendReviewProviderMessage(
  input: ReviewProviderSendInput
): Promise<DeliveryResult> {
  if (input.channel === "sms") {
    return sendSms({
      businessId: input.businessId,
      leadId: input.leadId,
      to: input.phone,
      body: input.messageBody,
      optedOut: input.optedOut,
      twilioFromNumber: input.twilioFromNumber,
      smsComplianceStatus: input.smsComplianceStatus,
    });
  }

  return sendEmail({
    businessId: input.businessId,
    leadId: input.leadId,
    to: input.email,
    subject: `${input.businessName} - Would you leave us a review?`,
    body: input.messageBody,
    fromEmail: input.resendFromEmail,
  });
}
