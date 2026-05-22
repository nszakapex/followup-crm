import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const DEMO_PREFIX = "demo-phase-5a";
export const DEMO_EXTERNAL_CRM_NAME = "FollowUp demo seed";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_AUTOMATIONS = [
  {
    type: "instant_lead_reply",
    name: "Instant Reply to New Leads",
    delay_hours: 0,
    trigger_status: "new",
    message_template:
      "Hey, this is {{business_name}}. Thanks for reaching out. We'll get back to you shortly. What can we help you with?",
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
      "Hi {{first_name}}, thank you for choosing {{business_name}}. Would you mind leaving us an honest Google review? Here's the link: {{google_review_link}}",
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

const DEMO_LEADS = [
  {
    key: "sarah-miller",
    first_name: "Sarah",
    last_name: "Miller",
    phone: "5550101001",
    email: "sarah.demo@example.com",
    source: "Website form",
    status: "new",
    intent: "Color consultation",
    notes: "Asked about availability for a first-time color appointment.",
    ai_summary: "New website lead looking for a color consultation this week.",
    followup_count: 0,
    createdDaysAgo: 1,
  },
  {
    key: "james-carter",
    first_name: "James",
    last_name: "Carter",
    phone: "5550101002",
    email: "james.demo@example.com",
    source: "Missed call",
    status: "needs_reply",
    intent: "Same-day appointment",
    notes: "Called after hours and asked for a quick callback.",
    ai_summary: "Needs a response after a missed call about same-day availability.",
    followup_count: 1,
    createdDaysAgo: 3,
    lastContactedDaysAgo: 2,
  },
  {
    key: "emma-rodriguez",
    first_name: "Emma",
    last_name: "Rodriguez",
    phone: "5550101003",
    email: "emma.demo@example.com",
    source: "Google Business Profile",
    status: "booked",
    intent: "Estimate",
    notes: "Booked a consultation after asking about service packages.",
    ai_summary: "Google lead converted into a booked estimate.",
    followup_count: 2,
    createdDaysAgo: 6,
    lastContactedDaysAgo: 4,
  },
  {
    key: "daniel-kim",
    first_name: "Daniel",
    last_name: "Kim",
    phone: "5550101004",
    email: "daniel.demo@example.com",
    source: "Referral",
    status: "review_requested",
    intent: "Completed service",
    notes: "Happy with the completed appointment and received a review request.",
    ai_summary: "Completed customer with a review request already sent.",
    followup_count: 3,
    createdDaysAgo: 10,
    lastContactedDaysAgo: 8,
  },
  {
    key: "olivia-bennett",
    first_name: "Olivia",
    last_name: "Bennett",
    phone: "5550101005",
    email: "olivia.demo@example.com",
    source: "Google Ads",
    status: "interested",
    intent: "Pricing question",
    notes: "Asked for pricing and wants to compare dates next week.",
    ai_summary: "Interested lead comparing pricing and appointment timing.",
    followup_count: 1,
    createdDaysAgo: 12,
    nextFollowupDaysFromNow: 2,
  },
  {
    key: "marcus-lee",
    first_name: "Marcus",
    last_name: "Lee",
    phone: "5550101006",
    email: "marcus.demo@example.com",
    source: "Walk-in",
    status: "completed",
    intent: "Completed service",
    notes: "Completed visit and thanked the team before leaving.",
    ai_summary: "Completed customer, strong candidate for an honest review request.",
    followup_count: 2,
    createdDaysAgo: 15,
    lastContactedDaysAgo: 14,
  },
  {
    key: "hannah-brooks",
    first_name: "Hannah",
    last_name: "Brooks",
    phone: "5550101007",
    email: "hannah.demo@example.com",
    source: "Facebook",
    status: "new",
    intent: "First visit",
    notes: "Sent a Facebook message asking whether new clients are accepted.",
    ai_summary: "New social lead asking about first-visit availability.",
    followup_count: 0,
    createdDaysAgo: 18,
  },
  {
    key: "priya-shah",
    first_name: "Priya",
    last_name: "Shah",
    phone: "5550101008",
    email: "priya.demo@example.com",
    source: "Website chat",
    status: "needs_reply",
    intent: "Appointment follow-up",
    notes: "Asked a follow-up question after getting the first reply.",
    ai_summary: "Needs owner reply before the lead can move forward.",
    followup_count: 2,
    createdDaysAgo: 21,
    lastContactedDaysAgo: 19,
  },
  {
    key: "ethan-walker",
    first_name: "Ethan",
    last_name: "Walker",
    phone: "5550101009",
    email: "ethan.demo@example.com",
    source: "Instagram",
    status: "contacted",
    intent: "Follow-up scheduled",
    notes: "Asked to be contacted later this week.",
    ai_summary: "Contacted lead with a future follow-up scheduled.",
    followup_count: 1,
    createdDaysAgo: 25,
    lastContactedDaysAgo: 23,
    nextFollowupDaysFromNow: 3,
  },
  {
    key: "grace-thompson",
    first_name: "Grace",
    last_name: "Thompson",
    phone: "5550101010",
    email: "grace.demo@example.com",
    source: "Referral",
    status: "completed",
    intent: "Completed service",
    notes: "Completed service and responded positively to the follow-up.",
    ai_summary: "Completed referral customer with positive sentiment.",
    followup_count: 2,
    createdDaysAgo: 29,
    lastContactedDaysAgo: 27,
  },
];

const DEMO_REVIEW_REQUESTS = [
  { key: "daniel-sms", leadKey: "daniel-kim", channel: "sms", status: "clicked", createdDaysAgo: 7, sentDaysAgo: 7, clickedDaysAgo: 6 },
  { key: "marcus-email", leadKey: "marcus-lee", channel: "email", status: "completed", createdDaysAgo: 12, sentDaysAgo: 12, clickedDaysAgo: 11 },
  { key: "grace-sms", leadKey: "grace-thompson", channel: "sms", status: "sent", createdDaysAgo: 20, sentDaysAgo: 20 },
  { key: "emma-sms", leadKey: "emma-rodriguez", channel: "sms", status: "pending", createdDaysAgo: 2 },
  { key: "olivia-email", leadKey: "olivia-bennett", channel: "email", status: "clicked", createdDaysAgo: 9, sentDaysAgo: 9, clickedDaysAgo: 8 },
  { key: "sarah-email", leadKey: "sarah-miller", channel: "email", status: "sent", createdDaysAgo: 1, sentDaysAgo: 1 },
  { key: "priya-sms", leadKey: "priya-shah", channel: "sms", status: "failed", createdDaysAgo: 18, sentDaysAgo: 18 },
];

const DEMO_MESSAGES = [
  { key: "sarah-auto", leadKey: "sarah-miller", channel: "sms", direction: "outbound", status: "sent", daysAgo: 1, body: "Hi Sarah, thanks for reaching out. We saw your color consultation request and will follow up shortly." },
  { key: "james-inbound", leadKey: "james-carter", channel: "sms", direction: "inbound", status: "received", daysAgo: 3, body: "Hi, I missed your call. Do you have anything open this afternoon?" },
  { key: "james-owner", leadKey: "james-carter", channel: "sms", direction: "outbound", status: "sent", daysAgo: 2, body: "Thanks James. We can help. What time window works best for you?" },
  { key: "emma-booked", leadKey: "emma-rodriguez", channel: "email", direction: "outbound", status: "delivered", daysAgo: 5, body: "Subject: Consultation confirmed\n\nEmma, your consultation is confirmed. We look forward to seeing you." },
  { key: "daniel-review", leadKey: "daniel-kim", channel: "sms", direction: "outbound", status: "sent", daysAgo: 7, body: "Daniel, thank you for choosing us. Would you mind leaving an honest Google review?" },
  { key: "olivia-followup", leadKey: "olivia-bennett", channel: "email", direction: "outbound", status: "sent", daysAgo: 11, body: "Subject: Follow-up\n\nOlivia, here are the appointment options we discussed." },
  { key: "marcus-review", leadKey: "marcus-lee", channel: "email", direction: "outbound", status: "sent", daysAgo: 12, body: "Subject: Quick review request\n\nMarcus, thank you for visiting. We'd appreciate an honest Google review." },
  { key: "hannah-auto", leadKey: "hannah-brooks", channel: "sms", direction: "outbound", status: "sent", daysAgo: 18, body: "Hi Hannah, thanks for messaging us. Yes, we are accepting new clients." },
  { key: "priya-inbound", leadKey: "priya-shah", channel: "sms", direction: "inbound", status: "received", daysAgo: 20, body: "Can someone confirm whether Saturday is available?" },
  { key: "ethan-followup", leadKey: "ethan-walker", channel: "sms", direction: "outbound", status: "sent", daysAgo: 23, body: "Ethan, checking in as requested. Are you still looking for an appointment next week?" },
  { key: "grace-review", leadKey: "grace-thompson", channel: "sms", direction: "outbound", status: "sent", daysAgo: 20, body: "Grace, thank you again. Would you mind sharing an honest review about your visit?" },
  { key: "internal-note", leadKey: "olivia-bennett", channel: "manual_note", direction: "internal", status: "delivered", daysAgo: 9, body: "Demo note: Olivia prefers weekday appointments after 3 PM." },
];

const DEMO_AUTOMATION_ACTIVITY = [
  { type: "instant_lead_reply", enabled: true, trigger_count: 14, lastTriggeredDaysAgo: 1 },
  { type: "twenty_four_hour_followup", enabled: true, trigger_count: 9, lastTriggeredDaysAgo: 2 },
  { type: "three_day_followup", enabled: true, trigger_count: 5, lastTriggeredDaysAgo: 4 },
  { type: "missed_call_textback", enabled: true, trigger_count: 3, lastTriggeredDaysAgo: 3 },
  { type: "review_request", enabled: true, trigger_count: 7, lastTriggeredDaysAgo: 1 },
  { type: "weekly_owner_summary", enabled: false, trigger_count: 2, lastTriggeredDaysAgo: 6 },
];

export function parseArgs(argv) {
  const parsed = { flags: new Set(), values: new Map() };

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const raw = arg.slice(2);
    const [key, ...rest] = raw.split("=");
    if (rest.length === 0) {
      parsed.flags.add(key);
    } else {
      parsed.values.set(key, rest.join("="));
    }
  }

  return parsed;
}

export function printSeedUsage() {
  console.log(`Usage:
  npm run seed:demo -- --business-id=<uuid> --confirm-demo

Safety:
  - Refuses to run without --business-id and --confirm-demo.
  - Refuses non-demo-looking businesses unless --allow-non-demo-business is passed.
  - Use --dry-run to validate the target without writing.
`);
}

export function printResetUsage() {
  console.log(`Usage:
  npm run reset:demo -- --business-id=<uuid> --confirm-demo

Safety:
  - Deletes only records with the ${DEMO_PREFIX} demo markers.
  - Refuses non-demo-looking businesses unless --allow-non-demo-business is passed.
  - Use --dry-run to validate the target without deleting.
`);
}

function loadEnvFile(fileName) {
  const filePath = path.join(repoRoot, fileName);
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setHours(10, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function dateDaysFromNow(days) {
  const date = new Date();
  date.setHours(10, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function makeToken(businessId, key) {
  const businessPart = businessId.replace(/-/g, "").slice(0, 16);
  return `${DEMO_PREFIX.replace(/-/g, "")}-${businessPart}-${key}`;
}

function ensureRequiredArgs(args) {
  const businessId = args.values.get("business-id");
  const confirmed = args.flags.has("confirm-demo");

  if (!businessId) {
    throw new Error("Missing --business-id=<uuid>.");
  }

  if (!confirmed) {
    throw new Error("Missing --confirm-demo. This prevents accidental demo seeding.");
  }

  return {
    businessId,
    dryRun: args.flags.has("dry-run"),
    allowNonDemoBusiness: args.flags.has("allow-non-demo-business"),
  };
}

export function createSupabaseAdminClient() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Demo scripts run server-side and require the service role key."
    );
  }

  if (serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY appears to be the anon key. Refusing to seed.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function loadBusiness(supabase, businessId, allowNonDemoBusiness) {
  const { data: business, error } = await supabase
    .from("businesses")
    .select("id, name, owner_email, google_review_link")
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    throw new Error(`Business lookup failed: ${error.message}`);
  }

  if (!business) {
    throw new Error(`Business not found for businessId: ${businessId}`);
  }

  const businessLabel = `${business.name ?? ""} ${business.owner_email ?? ""}`;
  const looksDemo = /\b(demo|sample|test)\b/i.test(businessLabel);

  if (!looksDemo && !allowNonDemoBusiness) {
    throw new Error(
      `Refusing to seed "${business.name}" because it does not look like a dedicated demo business. Create a demo/test business, or rerun with --allow-non-demo-business if you intentionally want demo records in this account.`
    );
  }

  return { ...business, looksDemo };
}

async function selectDemoLeadIds(supabase, businessId) {
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("business_id", businessId)
    .eq("external_crm_name", DEMO_EXTERNAL_CRM_NAME)
    .like("external_crm_id", `${DEMO_PREFIX}:%`);

  if (error) {
    throw new Error(`Demo lead lookup failed: ${error.message}`);
  }

  return (data ?? []).map((row) => row.id);
}

async function upsertDemoLeads(supabase, businessId) {
  const { data: existing, error: existingError } = await supabase
    .from("leads")
    .select("id, external_crm_id")
    .eq("business_id", businessId)
    .eq("external_crm_name", DEMO_EXTERNAL_CRM_NAME)
    .like("external_crm_id", `${DEMO_PREFIX}:lead:%`);

  if (existingError) {
    throw new Error(`Existing demo lead lookup failed: ${existingError.message}`);
  }

  const existingByExternalId = new Map(
    (existing ?? []).map((row) => [row.external_crm_id, row.id])
  );
  const leadIdsByKey = new Map();
  let inserted = 0;
  let updated = 0;

  for (const lead of DEMO_LEADS) {
    const externalCrmId = `${DEMO_PREFIX}:lead:${lead.key}`;
    const row = {
      business_id: businessId,
      first_name: lead.first_name,
      last_name: lead.last_name,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      status: lead.status,
      intent: lead.intent,
      notes: lead.notes,
      ai_summary: lead.ai_summary,
      followup_count: lead.followup_count,
      last_contacted_at: lead.lastContactedDaysAgo
        ? dateDaysAgo(lead.lastContactedDaysAgo)
        : null,
      next_followup_at: lead.nextFollowupDaysFromNow
        ? dateDaysFromNow(lead.nextFollowupDaysFromNow)
        : null,
      external_crm_name: DEMO_EXTERNAL_CRM_NAME,
      external_crm_id: externalCrmId,
      sync_status: "synced",
      opted_out: false,
      consent_source: "demo seed",
      created_at: dateDaysAgo(lead.createdDaysAgo),
    };

    const existingId = existingByExternalId.get(externalCrmId);

    if (existingId) {
      const { data: updatedLead, error: updateError } = await supabase
        .from("leads")
        .update(row)
        .eq("id", existingId)
        .eq("business_id", businessId)
        .select("id")
        .single();

      if (updateError || !updatedLead) {
        throw new Error(
          `Failed to update demo lead ${lead.key}: ${updateError?.message ?? "No row returned"}`
        );
      }

      leadIdsByKey.set(lead.key, updatedLead.id);
      updated += 1;
    } else {
      const { data: insertedLead, error: insertError } = await supabase
        .from("leads")
        .insert(row)
        .select("id")
        .single();

      if (insertError || !insertedLead) {
        throw new Error(
          `Failed to insert demo lead ${lead.key}: ${insertError?.message ?? "No row returned"}`
        );
      }

      leadIdsByKey.set(lead.key, insertedLead.id);
      inserted += 1;
    }
  }

  return { leadIdsByKey, inserted, updated };
}

async function upsertDemoReviewRequests(supabase, business, leadIdsByKey) {
  const { data: existing, error: existingError } = await supabase
    .from("review_requests")
    .select("id, click_token")
    .eq("business_id", business.id)
    .like("click_token", `${DEMO_PREFIX.replace(/-/g, "")}-%`);

  if (existingError) {
    throw new Error(`Existing demo review request lookup failed: ${existingError.message}`);
  }

  const existingByToken = new Map((existing ?? []).map((row) => [row.click_token, row.id]));
  let inserted = 0;
  let updated = 0;

  for (const request of DEMO_REVIEW_REQUESTS) {
    const leadId = leadIdsByKey.get(request.leadKey);
    const lead = DEMO_LEADS.find((item) => item.key === request.leadKey);
    if (!leadId || !lead) continue;

    const clickToken = makeToken(business.id, request.key);
    const customerName = `${lead.first_name} ${lead.last_name}`;
    const trackedLink = `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(/\/$/, "")}/r/${clickToken}`;
    const row = {
      business_id: business.id,
      lead_id: leadId,
      customer_name: customerName,
      phone: lead.phone,
      email: lead.email,
      channel: request.channel,
      message_body: `Hi ${lead.first_name}, thank you for choosing us. Would you mind leaving an honest Google review? ${trackedLink}`,
      status: request.status,
      click_token: clickToken,
      sent_at: request.sentDaysAgo ? dateDaysAgo(request.sentDaysAgo) : null,
      clicked_at: request.clickedDaysAgo ? dateDaysAgo(request.clickedDaysAgo) : null,
      created_at: dateDaysAgo(request.createdDaysAgo),
    };

    const existingId = existingByToken.get(clickToken);

    if (existingId) {
      const { error: updateError } = await supabase
        .from("review_requests")
        .update(row)
        .eq("id", existingId)
        .eq("business_id", business.id);

      if (updateError) {
        throw new Error(`Failed to update demo review request ${request.key}: ${updateError.message}`);
      }

      updated += 1;
    } else {
      const { error: insertError } = await supabase.from("review_requests").insert(row);

      if (insertError) {
        throw new Error(`Failed to insert demo review request ${request.key}: ${insertError.message}`);
      }

      inserted += 1;
    }

  }

  return { inserted, updated };
}

async function upsertDemoMessages(supabase, businessId, leadIdsByKey) {
  const { data: existing, error: existingError } = await supabase
    .from("messages")
    .select("id, provider_message_id")
    .eq("business_id", businessId)
    .eq("provider", "demo_seed")
    .like("provider_message_id", `${DEMO_PREFIX}:message:%`);

  if (existingError) {
    throw new Error(`Existing demo message lookup failed: ${existingError.message}`);
  }

  const existingByProviderId = new Map(
    (existing ?? []).map((row) => [row.provider_message_id, row.id])
  );
  let inserted = 0;
  let updated = 0;

  for (const message of DEMO_MESSAGES) {
    const leadId = leadIdsByKey.get(message.leadKey);
    if (!leadId) continue;

    const providerMessageId = `${DEMO_PREFIX}:message:${message.key}`;
    const isInbound = message.direction === "inbound";
    const timestamp = dateDaysAgo(message.daysAgo);
    const row = {
      business_id: businessId,
      lead_id: leadId,
      channel: message.channel,
      direction: message.direction,
      body: message.body,
      status: message.status,
      provider: "demo_seed",
      provider_message_id: providerMessageId,
      sent_at: isInbound ? null : timestamp,
      received_at: isInbound ? timestamp : null,
      error_message: null,
      created_at: timestamp,
    };

    const existingId = existingByProviderId.get(providerMessageId);

    if (existingId) {
      const { error: updateError } = await supabase
        .from("messages")
        .update(row)
        .eq("id", existingId)
        .eq("business_id", businessId);

      if (updateError) {
        throw new Error(`Failed to update demo message ${message.key}: ${updateError.message}`);
      }

      updated += 1;
    } else {
      const { error: insertError } = await supabase.from("messages").insert(row);

      if (insertError) {
        throw new Error(`Failed to insert demo message ${message.key}: ${insertError.message}`);
      }

      inserted += 1;
    }
  }

  return { inserted, updated };
}

async function ensureDemoAutomations(supabase, businessId) {
  const { data: existing, error: existingError } = await supabase
    .from("automations")
    .select("id, type, enabled, trigger_count, last_triggered_at")
    .eq("business_id", businessId);

  if (existingError) {
    throw new Error(`Automation lookup failed: ${existingError.message}`);
  }

  const existingTypes = new Set((existing ?? []).map((row) => row.type));
  const previousStates = (existing ?? [])
    .filter((row) => DEMO_AUTOMATION_ACTIVITY.some((activity) => activity.type === row.type))
    .map((row) => ({
      id: row.id,
      type: row.type,
      enabled: row.enabled,
      trigger_count: row.trigger_count,
      last_triggered_at: row.last_triggered_at,
    }));
  const missing = DEFAULT_AUTOMATIONS.filter((automation) => !existingTypes.has(automation.type));
  const insertedTypes = missing.map((automation) => automation.type);
  let inserted = 0;

  if (missing.length > 0) {
    const rows = missing.map((automation) => ({
      business_id: businessId,
      name: automation.name,
      type: automation.type,
      enabled: false,
      delay_hours: automation.delay_hours,
      trigger_status: automation.trigger_status,
      message_template: automation.message_template,
      channel: automation.channel,
    }));

    const { error: insertError } = await supabase.from("automations").insert(rows);

    if (insertError) {
      throw new Error(`Failed to create default demo automations: ${insertError.message}`);
    }

    inserted = rows.length;
  }

  const { data: automations, error: reloadError } = await supabase
    .from("automations")
    .select("id, type")
    .eq("business_id", businessId);

  if (reloadError) {
    throw new Error(`Automation reload failed: ${reloadError.message}`);
  }

  let updated = 0;
  for (const activity of DEMO_AUTOMATION_ACTIVITY) {
    const automation = (automations ?? []).find((row) => row.type === activity.type);
    if (!automation) continue;

    const { error: updateError } = await supabase
      .from("automations")
      .update({
        enabled: activity.enabled,
        trigger_count: activity.trigger_count,
        last_triggered_at: dateDaysAgo(activity.lastTriggeredDaysAgo),
      })
      .eq("id", automation.id)
      .eq("business_id", businessId);

    if (updateError) {
      throw new Error(`Failed to update demo automation ${activity.type}: ${updateError.message}`);
    }

    updated += 1;
  }

  return { inserted, updated, previousStates, insertedTypes };
}

async function loadLatestDemoSeedAudit(supabase, businessId) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, metadata_json")
    .eq("business_id", businessId)
    .eq("entity_type", "business")
    .eq("entity_id", businessId)
    .eq("action", "demo_seed_applied")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load demo audit log: ${error.message}`);
  }

  return data ?? null;
}

async function restoreDemoAutomationState(supabase, business, auditMetadata) {
  const automationMetadata = auditMetadata?.automations;
  const previousStates = Array.isArray(automationMetadata?.previousStates)
    ? automationMetadata.previousStates
    : [];
  const insertedTypes = Array.isArray(automationMetadata?.insertedTypes)
    ? automationMetadata.insertedTypes
    : [];

  let restored = 0;
  let deletedSeedCreated = 0;

  if (insertedTypes.length > 0) {
    const { count, error } = await supabase
      .from("automations")
      .delete({ count: "exact" })
      .eq("business_id", business.id)
      .in("type", insertedTypes);

    if (error) {
      throw new Error(`Failed to delete seed-created automations: ${error.message}`);
    }

    deletedSeedCreated = count ?? 0;
  }

  if (previousStates.length > 0) {
    for (const state of previousStates) {
      const { error } = await supabase
        .from("automations")
        .update({
          enabled: state.enabled,
          trigger_count: state.trigger_count,
          last_triggered_at: state.last_triggered_at,
        })
        .eq("id", state.id)
        .eq("business_id", business.id);

      if (error) {
        throw new Error(`Failed to restore automation ${state.type}: ${error.message}`);
      }

      restored += 1;
    }

    return { restored, deletedSeedCreated, fallbackReset: false };
  }

  if (!business.looksDemo) {
    return { restored, deletedSeedCreated, fallbackReset: false };
  }

  for (const activity of DEMO_AUTOMATION_ACTIVITY) {
    const { error } = await supabase
      .from("automations")
      .update({
        enabled: false,
        trigger_count: 0,
        last_triggered_at: null,
      })
      .eq("business_id", business.id)
      .eq("type", activity.type);

    if (error) {
      throw new Error(`Failed to reset demo automation ${activity.type}: ${error.message}`);
    }

    restored += 1;
  }

  return { restored, deletedSeedCreated, fallbackReset: true };
}

async function markBusinessDemoReady(supabase, business) {
  const update = {
    google_review_link:
      business.google_review_link ||
      "https://www.google.com/search?q=demo+local+business+reviews",
    review_requests_enabled: true,
    lead_followup_enabled: true,
  };

  const { error } = await supabase
    .from("businesses")
    .update(update)
    .eq("id", business.id);

  if (error) {
    throw new Error(`Failed to mark business demo-ready: ${error.message}`);
  }
}

export async function seedDemoData(args) {
  const { businessId, dryRun, allowNonDemoBusiness } = ensureRequiredArgs(args);
  const supabase = createSupabaseAdminClient();
  const business = await loadBusiness(supabase, businessId, allowNonDemoBusiness);

  if (dryRun) {
    return {
      dryRun: true,
      business,
      planned: {
        leads: DEMO_LEADS.length,
        reviewRequests: DEMO_REVIEW_REQUESTS.length,
        messages: DEMO_MESSAGES.length,
        automations: DEMO_AUTOMATION_ACTIVITY.length,
      },
    };
  }

  await markBusinessDemoReady(supabase, business);
  const leads = await upsertDemoLeads(supabase, business.id);
  const reviewRequests = await upsertDemoReviewRequests(
    supabase,
    business,
    leads.leadIdsByKey
  );
  const messages = await upsertDemoMessages(supabase, business.id, leads.leadIdsByKey);
  const automations = await ensureDemoAutomations(supabase, business.id);

  const { error: auditError } = await supabase.from("audit_logs").insert({
    business_id: business.id,
    user_id: null,
    action: "demo_seed_applied",
    entity_type: "business",
    entity_id: business.id,
    metadata_json: {
      prefix: DEMO_PREFIX,
      leads: DEMO_LEADS.length,
      reviewRequests: DEMO_REVIEW_REQUESTS.length,
      messages: DEMO_MESSAGES.length,
      automations: {
        previousStates: automations.previousStates,
        insertedTypes: automations.insertedTypes,
      },
    },
  });

  if (auditError) {
    throw new Error(`Failed to write demo audit log: ${auditError.message}`);
  }

  return { dryRun: false, business, leads, reviewRequests, messages, automations };
}

export async function resetDemoData(args) {
  const { businessId, dryRun, allowNonDemoBusiness } = ensureRequiredArgs(args);
  const supabase = createSupabaseAdminClient();
  const business = await loadBusiness(supabase, businessId, allowNonDemoBusiness);
  const demoLeadIds = await selectDemoLeadIds(supabase, business.id);
  const seedAudit = await loadLatestDemoSeedAudit(supabase, business.id);

  if (dryRun) {
    const automationMetadata = seedAudit?.metadata_json?.automations;
    return {
      dryRun: true,
      business,
      planned: {
        demoLeadIds,
        resetAutomations: Array.isArray(automationMetadata?.previousStates)
          ? automationMetadata.previousStates.map((state) => state.type)
          : business.looksDemo
            ? DEMO_AUTOMATION_ACTIVITY.map((item) => item.type)
            : [],
      },
    };
  }

  let deletedMessages = 0;
  let deletedReviewRequests = 0;
  let deletedLeads = 0;

  if (demoLeadIds.length > 0) {
    const { count: messageCount, error: messageDeleteError } = await supabase
      .from("messages")
      .delete({ count: "exact" })
      .eq("business_id", business.id)
      .in("lead_id", demoLeadIds);

    if (messageDeleteError) {
      throw new Error(`Failed to delete demo messages: ${messageDeleteError.message}`);
    }

    deletedMessages += messageCount ?? 0;

    const { count: reviewCount, error: reviewDeleteError } = await supabase
      .from("review_requests")
      .delete({ count: "exact" })
      .eq("business_id", business.id)
      .in("lead_id", demoLeadIds);

    if (reviewDeleteError) {
      throw new Error(`Failed to delete demo review requests: ${reviewDeleteError.message}`);
    }

    deletedReviewRequests += reviewCount ?? 0;

    const { count: leadCount, error: leadDeleteError } = await supabase
      .from("leads")
      .delete({ count: "exact" })
      .eq("business_id", business.id)
      .in("id", demoLeadIds);

    if (leadDeleteError) {
      throw new Error(`Failed to delete demo leads: ${leadDeleteError.message}`);
    }

    deletedLeads += leadCount ?? 0;
  }

  const { count: orphanReviewCount, error: orphanReviewError } = await supabase
    .from("review_requests")
    .delete({ count: "exact" })
    .eq("business_id", business.id)
    .like("click_token", `${DEMO_PREFIX.replace(/-/g, "")}-%`);

  if (orphanReviewError) {
    throw new Error(`Failed to delete demo token review requests: ${orphanReviewError.message}`);
  }

  deletedReviewRequests += orphanReviewCount ?? 0;

  const { count: orphanMessageCount, error: orphanMessageError } = await supabase
    .from("messages")
    .delete({ count: "exact" })
    .eq("business_id", business.id)
    .eq("provider", "demo_seed")
    .like("provider_message_id", `${DEMO_PREFIX}:message:%`);

  if (orphanMessageError) {
    throw new Error(`Failed to delete demo provider messages: ${orphanMessageError.message}`);
  }

  deletedMessages += orphanMessageCount ?? 0;

  const automationReset = await restoreDemoAutomationState(
    supabase,
    business,
    seedAudit?.metadata_json ?? null
  );

  const { error: auditDeleteError } = await supabase
    .from("audit_logs")
    .delete()
    .eq("business_id", business.id)
    .eq("entity_type", "business")
    .eq("entity_id", business.id)
    .in("action", ["demo_seed_applied"]);

  if (auditDeleteError) {
    throw new Error(`Failed to delete demo audit logs: ${auditDeleteError.message}`);
  }

  return {
    dryRun: false,
    business,
    deleted: {
      messages: deletedMessages,
      reviewRequests: deletedReviewRequests,
      leads: deletedLeads,
      resetAutomations: automationReset.restored,
      deletedSeedCreatedAutomations: automationReset.deletedSeedCreated,
    },
  };
}
