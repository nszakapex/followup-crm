"use server";

import { createClient } from "@/lib/supabase/server";
import { sendReviewRequest } from "@/lib/reviews/send-review-request";
import { revalidatePath } from "next/cache";

type ManualReviewChannel = "sms" | "email";

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

function getBusinessNotFoundError(businessId: string) {
  return isDevelopment()
    ? `Business not found for businessId: ${businessId}`
    : "Business not found.";
}

function isManualReviewChannel(value: FormDataEntryValue | null): value is ManualReviewChannel {
  return value === "sms" || value === "email";
}

export async function sendManualReviewRequest(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false as const, error: "Not authenticated." };
  }

  const leadId = formData.get("lead_id");
  const channel = formData.get("channel");

  if (typeof leadId !== "string" || !leadId) {
    return { success: false as const, error: "Choose a customer first." };
  }

  if (!isManualReviewChannel(channel)) {
    return { success: false as const, error: "Choose SMS or email." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .maybeSingle();

  const resolvedBusinessId = profile?.business_id ?? null;

  logReviewRequestDebug("resolved authenticated user", {
    authenticatedUserId: user.id,
    resolvedUsersBusinessId: resolvedBusinessId,
    profileLookupError: profileError?.message ?? null,
  });

  if (profileError || !resolvedBusinessId) {
    return { success: false as const, error: "User is not connected to a business." };
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, google_review_link")
    .eq("id", resolvedBusinessId)
    .maybeSingle();

  logReviewRequestDebug("validated business before send", {
    incomingBusinessId: resolvedBusinessId,
    authenticatedUserId: user.id,
    resolvedUsersBusinessId: resolvedBusinessId,
    businessFound: Boolean(business),
    businessLookupError: businessError?.message ?? null,
  });

  if (businessError || !business) {
    return {
      success: false as const,
      error: getBusinessNotFoundError(resolvedBusinessId),
    };
  }

  if (!business?.google_review_link) {
    return {
      success: false as const,
      error: "Google review link is not configured. Add it in Settings.",
    };
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, first_name, last_name, phone, email, opted_out")
    .eq("id", leadId)
    .eq("business_id", resolvedBusinessId)
    .maybeSingle();

  if (leadError || !lead) {
    return {
      success: false as const,
      error: leadError?.message ?? "Customer not found.",
    };
  }

  if (channel === "sms" && !lead.phone) {
    return { success: false as const, error: "This customer does not have a phone number." };
  }

  if (channel === "sms" && lead.opted_out) {
    return { success: false as const, error: "This customer has opted out of SMS messages." };
  }

  if (channel === "email" && !lead.email) {
    return { success: false as const, error: "This customer does not have an email address." };
  }

  const customerName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");

  const result = await sendReviewRequest({
    businessId: resolvedBusinessId,
    authenticatedUserId: user.id,
    resolvedUsersBusinessId: resolvedBusinessId,
    leadId: lead.id,
    customerName,
    phone: lead.phone,
    email: lead.email,
    channel,
    optedOut: lead.opted_out,
  });

  if (!result.success) {
    return {
      success: false as const,
      error: result.error ?? "Failed to send review request.",
    };
  }

  revalidatePath("/reviews");

  return {
    success: true as const,
    reviewRequestId: result.reviewRequestId,
  };
}
