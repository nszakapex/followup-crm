import "server-only";

import { createClient } from "@supabase/supabase-js";
import { renderTemplate } from "@/lib/messaging/render-template";
import { sendSms } from "@/lib/messaging/send-sms";
import { sendEmail } from "@/lib/messaging/send-email";

interface SendReviewRequestParams {
  businessId: string;
  authenticatedUserId?: string | null;
  resolvedUsersBusinessId?: string | null;
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
  message?: string;
  deliverySkipped?: boolean;
  error?: string;
}

function createServiceClient(url: string, serviceRoleKey: string) {
  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

const DEFAULT_REVIEW_TEMPLATE =
  "Hi {{first_name}}, thank you for choosing {{business_name}}. Would you mind leaving us an honest Google review? Here's the link: {{google_review_link}}";

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function logReviewRequestDebug(
  message: string,
  payload: Record<string, unknown>
) {
  if (!isDevelopment()) return;

  console.info(`[reviews:send] ${message}`, payload);
}

function getBusinessLookupError(businessId: string, message: string) {
  return isDevelopment()
    ? `Business not found for businessId: ${businessId || "[missing]"}. Supabase error: ${message}`
    : "Business not found.";
}

function getBusinessQueryError(businessId: string, message: string) {
  return isDevelopment()
    ? `Business lookup failed for businessId: ${businessId || "[missing]"}. Supabase error: ${message}`
    : "Business lookup failed.";
}

function getDatabaseError(action: string, message: string) {
  return isDevelopment()
    ? `${action}: ${message}`
    : action;
}

function getTrackedReviewLink(clickToken: string | null, googleReviewLink: string) {
  if (!clickToken) return googleReviewLink;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3001" : null);

  if (!appUrl) return googleReviewLink;

  return `${appUrl.replace(/\/$/, "")}/r/${clickToken}`;
}

/**
 * Send a review request to a customer via SMS or email.
 *
 * - Loads the business to get the Google review link and name.
 * - Renders the template with lead/business variables.
 * - Creates a review_requests row.
 * - Sends via test mode, Twilio, or Resend after the row exists.
 */
export async function sendReviewRequest(
  params: SendReviewRequestParams
): Promise<SendReviewRequestResult> {
  const {
    businessId,
    authenticatedUserId,
    resolvedUsersBusinessId,
    leadId,
    customerName,
    phone,
    email,
    channel,
    optedOut,
  } = params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;

  logReviewRequestDebug("service client config", {
    supabaseUrl,
    hasServiceRoleKey: Boolean(serviceRoleKey),
    serviceRoleKeyMatchesAnonKey:
      Boolean(serviceRoleKey) &&
      serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    incomingBusinessId: businessId,
    authenticatedUserId: authenticatedUserId ?? null,
    resolvedUsersBusinessId: resolvedUsersBusinessId ?? null,
  });

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      success: false,
      reviewRequestId: null,
      error: getBusinessLookupError(
        businessId,
        "Missing Supabase URL or service role key."
      ),
    };
  }

  const supabase = createServiceClient(supabaseUrl, serviceRoleKey);

  // Load business
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("name, google_review_link, twilio_from_number, resend_from_email")
    .eq("id", businessId)
    .maybeSingle();

  logReviewRequestDebug("service business lookup", {
    supabaseUrl,
    hasServiceRoleKey: Boolean(serviceRoleKey),
    serviceRoleKeyMatchesAnonKey:
      Boolean(serviceRoleKey) &&
      serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    incomingBusinessId: businessId,
    authenticatedUserId: authenticatedUserId ?? null,
    resolvedUsersBusinessId: resolvedUsersBusinessId ?? null,
    businessFound: Boolean(business),
    businessLookupError: businessError?.message ?? null,
    businessLookupCode: businessError?.code ?? null,
  });

  if (businessError) {
    return {
      success: false,
      reviewRequestId: null,
      error: getBusinessQueryError(businessId, businessError.message),
    };
  }

  if (!business) {
    return {
      success: false,
      reviewRequestId: null,
      error: getBusinessLookupError(businessId, "No matching business row returned."),
    };
  }

  if (!business.google_review_link) {
    return {
      success: false,
      reviewRequestId: null,
      error: "Google review link is not configured. Add it in Settings.",
    };
  }

  if (channel !== "sms" && channel !== "email") {
    return {
      success: false,
      reviewRequestId: null,
      error: "Unsupported review request channel.",
    };
  }

  if (channel === "sms" && !phone) {
    return {
      success: false,
      reviewRequestId: null,
      error: "Customer phone number is required for SMS review requests.",
    };
  }

  if (channel === "sms" && optedOut) {
    return {
      success: false,
      reviewRequestId: null,
      error: "This customer has opted out of review requests.",
    };
  }

  if (channel === "email" && !email) {
    return {
      success: false,
      reviewRequestId: null,
      error: "Customer email is required for email review requests.",
    };
  }

  // Parse first/last from customer name
  const nameParts = customerName.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  // Render an initial body with the direct Google link so the row can be created.
  const initialMessageBody = renderTemplate(DEFAULT_REVIEW_TEMPLATE, {
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
      message_body: initialMessageBody,
      status: "pending",
    })
    .select("id, click_token")
    .single();

  if (insertError || !reviewRequest) {
    return {
      success: false,
      reviewRequestId: null,
      error: getDatabaseError(
        "Failed to create review request",
        insertError?.message || "Unknown error"
      ),
    };
  }

  if (!reviewRequest.click_token) {
    return {
      success: false,
      reviewRequestId: reviewRequest.id,
      error: isDevelopment()
        ? "Review request click token was not generated."
        : "Failed to create review request.",
    };
  }

  const reviewLink = getTrackedReviewLink(
    reviewRequest.click_token,
    business.google_review_link
  );

  const messageBody = renderTemplate(DEFAULT_REVIEW_TEMPLATE, {
    first_name: firstName,
    last_name: lastName,
    business_name: business.name,
    google_review_link: reviewLink,
  });

  if (messageBody !== initialMessageBody) {
    const { error: messageBodyUpdateError } = await supabase
      .from("review_requests")
      .update({ message_body: messageBody })
      .eq("id", reviewRequest.id);

    if (messageBodyUpdateError) {
      return {
        success: false,
        reviewRequestId: reviewRequest.id,
        error: getDatabaseError(
          "Failed to update review request link",
          messageBodyUpdateError.message
        ),
      };
    }
  }

  // Send via appropriate channel. The delivery helpers log the message row and
  // return a structured result for real, skipped, and failed deliveries.
  if (channel === "sms") {
    const deliveryResult = await sendSms({
      businessId,
      leadId,
      to: phone,
      body: messageBody,
      optedOut,
      twilioFromNumber: business.twilio_from_number,
    });

    const newStatus = deliveryResult.success
      ? deliveryResult.skipped
        ? "pending"
        : "sent"
      : "failed";
    const { error: statusUpdateError } = await supabase
      .from("review_requests")
      .update({
        status: newStatus,
        sent_at: deliveryResult.success && !deliveryResult.skipped
          ? new Date().toISOString()
          : null,
      })
      .eq("id", reviewRequest.id);

    if (statusUpdateError) {
      return {
        success: false,
        reviewRequestId: reviewRequest.id,
        error: getDatabaseError(
          "Failed to update review request status",
          statusUpdateError.message
        ),
      };
    }

    return {
      success: deliveryResult.success,
      reviewRequestId: reviewRequest.id,
      message: deliveryResult.userMessage,
      deliverySkipped: deliveryResult.skipped,
      error: deliveryResult.success ? undefined : deliveryResult.error,
    };
  }

  if (channel === "email") {
    const deliveryResult = await sendEmail({
      businessId,
      leadId,
      to: email,
      subject: `${business.name} - Would you leave us a review?`,
      body: messageBody,
      fromEmail: business.resend_from_email,
    });

    const newStatus = deliveryResult.success
      ? deliveryResult.skipped
        ? "pending"
        : "sent"
      : "failed";
    const { error: statusUpdateError } = await supabase
      .from("review_requests")
      .update({
        status: newStatus,
        sent_at: deliveryResult.success && !deliveryResult.skipped
          ? new Date().toISOString()
          : null,
      })
      .eq("id", reviewRequest.id);

    if (statusUpdateError) {
      return {
        success: false,
        reviewRequestId: reviewRequest.id,
        error: getDatabaseError(
          "Failed to update review request status",
          statusUpdateError.message
        ),
      };
    }

    return {
      success: deliveryResult.success,
      reviewRequestId: reviewRequest.id,
      message: deliveryResult.userMessage,
      deliverySkipped: deliveryResult.skipped,
      error: deliveryResult.success ? undefined : deliveryResult.error,
    };
  }

  return {
    success: false,
    reviewRequestId: reviewRequest.id,
    error: "Unsupported review request channel.",
  };
}
