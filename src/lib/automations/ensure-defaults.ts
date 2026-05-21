import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationType, MessageChannel } from "@/types/database";

interface DefaultAutomation {
  type: AutomationType;
  name: string;
  delay_hours: number;
  trigger_status: string | null;
  message_template: string;
  channel: MessageChannel;
}

const DEFAULTS: DefaultAutomation[] = [
  {
    type: "instant_lead_reply",
    name: "Instant Reply to New Leads",
    delay_hours: 0,
    trigger_status: "new",
    message_template:
      "Hey, this is {{business_name}}. Thanks for reaching out — we'll get back to you shortly. What can we help you with?",
    channel: "sms",
  },
  {
    type: "twenty_four_hour_followup",
    name: "24-Hour Follow-Up",
    delay_hours: 24,
    trigger_status: "contacted",
    message_template:
      "Hey {{first_name}}, just following up from yesterday. Still interested? Let us know how we can help.",
    channel: "sms",
  },
  {
    type: "three_day_followup",
    name: "3-Day Follow-Up",
    delay_hours: 72,
    trigger_status: "contacted",
    message_template:
      "Hi {{first_name}}, we wanted to check in one more time. If you're still looking for help, we're here. Just reply to this message.",
    channel: "sms",
  },
  {
    type: "missed_call_textback",
    name: "Missed-Call Text-Back",
    delay_hours: 0,
    trigger_status: "new",
    message_template: "Hey, sorry we missed your call. How can we help you?",
    channel: "sms",
  },
  {
    type: "review_request",
    name: "Google Review Request",
    delay_hours: 1,
    trigger_status: "completed",
    message_template:
      "Hi {{first_name}}, thank you for choosing {{business_name}}. If you had a good experience, would you mind leaving us an honest Google review? Here's the link: {{google_review_link}}",
    channel: "sms",
  },
  {
    type: "weekly_owner_summary",
    name: "Weekly Owner Summary",
    delay_hours: 168,
    trigger_status: null,
    message_template: "",
    channel: "email",
  },
];

/**
 * Ensures all 6 default automation types exist for a business.
 * Only creates missing types — never duplicates existing rows.
 */
export async function ensureDefaultAutomations(
  supabase: SupabaseClient,
  businessId: string
): Promise<void> {
  const { data: existing } = await supabase
    .from("automations")
    .select("type")
    .eq("business_id", businessId);

  const existingTypes = new Set((existing ?? []).map((a: { type: string }) => a.type));

  const missing = DEFAULTS.filter((d) => !existingTypes.has(d.type));

  if (missing.length === 0) return;

  const rows = missing.map((d) => ({
    business_id: businessId,
    name: d.name,
    type: d.type,
    enabled: false,
    delay_hours: d.delay_hours,
    trigger_status: d.trigger_status,
    message_template: d.message_template,
    channel: d.channel,
  }));

  await supabase.from("automations").insert(rows);
}
