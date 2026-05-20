"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

interface OnboardingData {
  // Step 1: Business info
  businessName: string;
  industry: string;
  website: string;
  ownerName: string;
  ownerPhone: string;
  // Step 2: Follow-up preferences
  instantReply: boolean;
  twentyFourHourFollowup: boolean;
  threeDayFollowup: boolean;
  preferredChannel: "sms" | "email";
  // Step 3: Review setup
  googleReviewLink: string;
  reviewRequestsEnabled: boolean;
  // Step 4: CRM mode
  crmMode: "standalone" | "connected";
  externalCrmName?: string;
}

export async function completeOnboarding(data: OnboardingData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  // Get the user's business
  const { data: userProfile } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();

  if (!userProfile) {
    return { error: "User profile not found." };
  }

  const businessId = userProfile.business_id;

  // Update business with onboarding data
  const { error: bizError } = await supabase
    .from("businesses")
    .update({
      name: data.businessName,
      industry: data.industry || null,
      website_url: data.website || null,
      owner_name: data.ownerName,
      owner_phone: data.ownerPhone || null,
      google_review_link: data.googleReviewLink || null,
      review_requests_enabled: data.reviewRequestsEnabled,
      lead_followup_enabled: true,
      sms_enabled: data.preferredChannel === "sms",
      email_enabled: data.preferredChannel === "email" || true,
    })
    .eq("id", businessId);

  if (bizError) {
    return { error: "Failed to save business info: " + bizError.message };
  }

  // Create default automations
  const automations = [];

  if (data.instantReply) {
    automations.push({
      business_id: businessId,
      name: "Instant Reply to New Leads",
      type: "instant_lead_reply" as const,
      enabled: true,
      delay_hours: 0,
      trigger_status: "new" as const,
      message_template: `Hey, this is ${data.businessName}. Thanks for reaching out — we'll get back to you shortly. What can we help you with?`,
      channel: data.preferredChannel as "sms" | "email",
    });
  }

  if (data.twentyFourHourFollowup) {
    automations.push({
      business_id: businessId,
      name: "24-Hour Follow-Up",
      type: "twenty_four_hour_followup" as const,
      enabled: true,
      delay_hours: 24,
      trigger_status: "contacted" as const,
      message_template: `Hey {{first_name}}, just following up from yesterday. Still interested? Let us know how we can help.`,
      channel: data.preferredChannel as "sms" | "email",
    });
  }

  if (data.threeDayFollowup) {
    automations.push({
      business_id: businessId,
      name: "3-Day Follow-Up",
      type: "three_day_followup" as const,
      enabled: true,
      delay_hours: 72,
      trigger_status: "contacted" as const,
      message_template: `Hi {{first_name}}, we wanted to check in one more time. If you're still looking for help, we're here. Just reply to this message.`,
      channel: data.preferredChannel as "sms" | "email",
    });
  }

  if (data.reviewRequestsEnabled) {
    automations.push({
      business_id: businessId,
      name: "Google Review Request",
      type: "review_request" as const,
      enabled: true,
      delay_hours: 1,
      trigger_status: "completed" as const,
      message_template: `Hi {{first_name}}, thank you for choosing ${data.businessName}. If you had a good experience, would you mind leaving us an honest Google review? Here's the link: ${data.googleReviewLink || "{{google_review_link}}"}`,
      channel: data.preferredChannel as "sms" | "email",
    });
  }

  // Always create missed call textback (disabled by default)
  automations.push({
    business_id: businessId,
    name: "Missed-Call Text-Back",
    type: "missed_call_textback" as const,
    enabled: false,
    delay_hours: 0,
    trigger_status: "new" as const,
    message_template: `Hey, sorry we missed your call. How can we help you?`,
    channel: "sms" as const,
  });

  // Always create weekly summary (disabled by default)
  automations.push({
    business_id: businessId,
    name: "Weekly Owner Summary",
    type: "weekly_owner_summary" as const,
    enabled: false,
    delay_hours: 168,
    trigger_status: null,
    message_template: "",
    channel: "email" as const,
  });

  if (automations.length > 0) {
    const { error: autoError } = await supabase
      .from("automations")
      .insert(automations);

    if (autoError) {
      return { error: "Business saved but automation setup failed: " + autoError.message };
    }
  }

  redirect("/dashboard");
}
