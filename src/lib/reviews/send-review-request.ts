import "server-only";

import { createClient } from "@supabase/supabase-js";
import { renderTemplate } from "@/lib/messaging/render-template";
import { sendSms } from "@/lib/messaging/send-sms";
import { sendEmail } from "@/lib/messaging/send-email";

interface SendReviewRequestParams {
  businessId: string;
  leadId: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  channel: "sms" | "email";
  optedOut: boolean;
}

interface SendReviewRequestResult {
  success: boolean;
  reviewRequestId: string | null;
  error?: string;
}

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const DEFAULT_REVIEW_TEMPLATE =
  "Hi {{first_name}}, thank you for choosing {{business_name}}. If you had a good experience, would you mind leaving us an honest Google review? Here's the link: {{google_review_link}}";

/**
 * Send a review request to a customer via SMS or email.
 *
 * - Loads the business to get the Google review link and name.
 * - Renders the template with lead/business variables.
 * - Creates a review_requests row.
 * - Sends via mock or real provider.
 */
export async function sendReviewRequest(
  params: SendReviewRequestParams
): Promise<SendReviewRequestResult> {
  const { businessId, leadId, customerName, phone, email, channel, optedOut } = params;
  const supabase = createServiceClient();

  // Load business
  const { data: business } = await supabase
    .from("businesses")
    .select("name, google_review_link, twilio_from_number, resend_from_email")
    .eq("id", businessId)
    .single();

  if (!business) {
    return { success: false, reviewRequestId: null, error: "Business not found." };
  }

  if (!business.google_review_link) {
    return {
      success: false,
      reviewRequestId: null,
      error: "Google review link is not configured. Add it in Settings.",
    };
  }

  // Parse first/last from customer name
  const nameParts = customerName.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  // Render message
  const messageBody = renderTemplate(DEFAULT_REVIEW_TEMPLATE, {
    first_name: firstName,
    last_name: lastName,
    business_name: business.name,
    google_review_link: business.google_review_link,
  });

  // Create review request row
  const { data: reviewRequest, error: insertError } = await supabase
    .from("review_requests")
    .insert({
      business_id: businessId,
      lead_id: leadId,
      customer_name: customerName,
      phone: phone || null,
      email: email || null,
      channel,
      message_body: messageBody,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !reviewRequest) {
    return {
      success: false,
      reviewRequestId: null,
      error: "Failed to create review request: " + (insertError?.message || "Unknown error"),
    };
  }

  // Send via appropriate channel
  if (channel === "sms" && phone) {
    const smsResult = await sendSms({
      businessId,
      leadId,
      to: phone,
      body: messageBody,
      optedOut,
      twilioFromNumber: business.twilio_from_number,
    });

    const newStatus = smsResult.success ? "sent" : "failed";
    await supabase
      .from("review_requests")
      .update({
        status: newStatus,
        sent_at: smsResult.success ? new Date().toISOString() : null,
      })
      .eq("id", reviewRequest.id);

    return {
      success: smsResult.success,
      reviewRequestId: reviewRequest.id,
      error: smsResult.error,
    };
  }

  if (channel === "email" && email) {
    const emailResult = await sendEmail({
      businessId,
      leadId,
      to: email,
      subject: `${business.name} — Would you leave us a review?`,
      body: messageBody,
      fromEmail: business.resend_from_email,
    });

    const newStatus = emailResult.success ? "sent" : "failed";
    await supabase
      .from("review_requests")
      .update({
        status: newStatus,
        sent_at: emailResult.success ? new Date().toISOString() : null,
      })
      .eq("id", reviewRequest.id);

    return {
      success: emailResult.success,
      reviewRequestId: reviewRequest.id,
      error: emailResult.error,
    };
  }

  // No valid contact for the chosen channel
  await supabase
    .from("review_requests")
    .update({ status: "failed" })
    .eq("id", reviewRequest.id);

  return {
    success: false,
    reviewRequestId: reviewRequest.id,
    error: `No ${channel === "sms" ? "phone number" : "email address"} available for this lead.`,
  };
}
