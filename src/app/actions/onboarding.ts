"use server";

import { redirect } from "next/navigation";

import { getAutomationTemplateForBusiness } from "@/lib/business-verticals/verticals";
import { createClient } from "@/lib/supabase/server";

interface OnboardingData {
  businessName: string;
  industry: string;
  website: string;
  ownerName: string;
  ownerPhone: string;
  instantReply: boolean;
  twentyFourHourFollowup: boolean;
  threeDayFollowup: boolean;
  preferredChannel: "sms" | "email";
  googleReviewLink: string;
  reviewRequestsEnabled: boolean;
  crmMode: "standalone" | "connected";
  externalCrmName?: string;
}

function getVerticalTemplate(
  industry: string,
  automationType: string,
  templateKey: string
) {
  return getAutomationTemplateForBusiness({
    business: { industry },
    automationType,
    templateKey,
    currentTemplate: null,
  });
}

export async function completeOnboarding(data: OnboardingData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const { data: userProfile, error: userProfileError } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();

  if (userProfileError || !userProfile) {
    return { error: "User profile not found." };
  }

  const businessId = userProfile.business_id;

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

  const automations = [];

  if (data.instantReply) {
    automations.push({
      business_id: businessId,
      name: "Instant Reply to New Leads",
      type: "instant_lead_reply" as const,
      enabled: true,
      delay_hours: 0,
      trigger_status: "new" as const,
      message_template: getVerticalTemplate(
        data.industry,
        "instant_lead_reply",
        "new_lead_initial"
      ),
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
      message_template: getVerticalTemplate(
        data.industry,
        "twenty_four_hour_followup",
        "new_lead_followup_1"
      ),
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
      message_template: getVerticalTemplate(
        data.industry,
        "three_day_followup",
        "no_response_followup"
      ),
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
      message_template: getVerticalTemplate(
        data.industry,
        "review_request",
        "review_request_initial"
      ),
      channel: data.preferredChannel as "sms" | "email",
    });
  }

  automations.push({
    business_id: businessId,
    name: "Missed-Call Text-Back",
    type: "missed_call_textback" as const,
    enabled: false,
    delay_hours: 0,
    trigger_status: "new" as const,
    message_template: getVerticalTemplate(
      data.industry,
      "missed_call_textback",
      "missed_call_initial"
    ),
    channel: "sms" as const,
  });

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
    const { error: autoError } = await supabase.from("automations").insert(automations);

    if (autoError) {
      return { error: "Business saved but automation setup failed: " + autoError.message };
    }
  }

  redirect("/dashboard");
}
