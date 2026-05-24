#!/usr/bin/env node

import {
  DEMO_EXTERNAL_CRM_NAME,
  DEMO_PREFIX,
  createSupabaseAdminClient,
  parseArgs,
} from "./demo-data.mjs";
import { resolveBusinessVertical } from "../src/lib/business-verticals/verticals.mjs";

const EXPECTED_DEMO_KEYS = [
  "maya-full-detail",
  "tyler-ceramic-missed-call",
  "zoe-estimate",
  "ben-booked",
  "riley-review-ready",
  "nora-review-requested",
  "leo-no-response",
  "chris-lost",
  "sam-missing-contact",
  "ava-duplicate-risk",
];

function printUsage() {
  console.log(`Usage:
  npm run verify:beta -- --business-id=<uuid>
  npm run verify:beta

Safety:
  - Read-only verification. It does not seed, reset, send, queue, or repair data.
  - If --business-id is omitted, the script looks for a business with demo seed leads.
  - Secret values are never printed.
`);
}

function pass(label, detail) {
  console.log(`PASS ${label}${detail ? ` - ${detail}` : ""}`);
}

function warn(label, detail) {
  console.log(`WARN ${label}${detail ? ` - ${detail}` : ""}`);
}

function fail(label, detail) {
  console.log(`FAIL ${label}${detail ? ` - ${detail}` : ""}`);
}

function isFakePhone(value) {
  if (!value) return true;
  return value.replace(/\D/g, "").startsWith("555010");
}

function isFakeEmail(value) {
  if (!value) return true;
  return value.toLowerCase().endsWith("@example.com");
}

async function resolveBusinessId(supabase, explicitBusinessId) {
  if (explicitBusinessId) return explicitBusinessId;

  const { data, error } = await supabase
    .from("leads")
    .select("business_id")
    .eq("external_crm_name", DEMO_EXTERNAL_CRM_NAME)
    .like("external_crm_id", `${DEMO_PREFIX}:lead:%`)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Demo business lookup failed: ${error.message}`);
  return data?.business_id ?? null;
}

function groupBy(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.has("help")) {
    printUsage();
    return;
  }

  const supabase = createSupabaseAdminClient();
  const businessId = await resolveBusinessId(supabase, args.values.get("business-id") ?? null);

  if (!businessId) {
    fail("Demo business", "No business id supplied and no demo seed leads were found.");
    process.exitCode = 1;
    return;
  }

  const [
    businessResult,
    leadsResult,
    actionsResult,
    reviewRequestsResult,
    automationsResult,
  ] = await Promise.all([
    supabase.from("businesses").select("id, name, industry, google_review_link").eq("id", businessId).maybeSingle(),
    supabase
      .from("leads")
      .select("id, status, phone, email, external_crm_id, external_crm_name")
      .eq("business_id", businessId),
    supabase
      .from("automation_actions")
      .select("id, lead_id, status, dedupe_key, review_request_id, send_status")
      .eq("business_id", businessId),
    supabase
      .from("review_requests")
      .select("id, lead_id, status, send_status, dedupe_key, automation_action_id")
      .eq("business_id", businessId),
    supabase.from("automations").select("id, type, enabled").eq("business_id", businessId),
  ]);

  const errors = [
    businessResult.error,
    leadsResult.error,
    actionsResult.error,
    reviewRequestsResult.error,
    automationsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    for (const error of errors) fail("Read-only query", error.message);
    process.exitCode = 1;
    return;
  }

  const business = businessResult.data;
  const leads = leadsResult.data ?? [];
  const actions = actionsResult.data ?? [];
  const reviewRequests = reviewRequestsResult.data ?? [];
  const automations = automationsResult.data ?? [];
  const leadIds = new Set(leads.map((lead) => lead.id));
  const demoLeads = leads.filter(
    (lead) =>
      lead.external_crm_name === DEMO_EXTERNAL_CRM_NAME &&
      lead.external_crm_id?.startsWith(`${DEMO_PREFIX}:lead:`)
  );
  let failed = false;

  if (business) {
    pass("Business", `${business.name} (${business.id})`);
  } else {
    fail("Business", "Business row not found.");
    failed = true;
  }

  if (business) {
    const vertical = resolveBusinessVertical(business.industry);
    if (vertical.id === "auto_detailing") {
      pass("Vertical", "auto_detailing");
    } else {
      warn("Vertical", `${vertical.id}; generic fallback is safe but detailing beta templates will not be selected.`);
    }
  }

  if (business?.google_review_link) {
    pass("Review link", "Configured.");
  } else {
    warn("Review link", "Missing; live review requests will be blocked.");
  }

  const keys = new Set(
    demoLeads
      .map((lead) => lead.external_crm_id?.replace(`${DEMO_PREFIX}:lead:`, ""))
      .filter(Boolean)
  );
  const missingKeys = EXPECTED_DEMO_KEYS.filter((key) => !keys.has(key));
  if (missingKeys.length === 0) {
    pass("Demo leads", `${demoLeads.length} expected detailing beta leads found.`);
  } else {
    fail("Demo leads", `Missing fixtures: ${missingKeys.join(", ")}`);
    failed = true;
  }

  const realLookingContacts = demoLeads.filter(
    (lead) => !isFakePhone(lead.phone) || !isFakeEmail(lead.email)
  );
  if (realLookingContacts.length === 0) {
    pass("Fake/test contacts", "Demo contacts use 555010 numbers and example.com emails or are intentionally blank.");
  } else {
    fail("Fake/test contacts", `${realLookingContacts.length} demo contact(s) look non-test.`);
    failed = true;
  }

  if (demoLeads.some((lead) => lead.status === "completed" && (lead.phone || lead.email))) {
    pass("Review-ready fixture", "At least one completed demo lead has a destination.");
  } else {
    fail("Review-ready fixture", "No completed demo lead with phone/email was found.");
    failed = true;
  }

  if (demoLeads.some((lead) => !lead.phone && !lead.email)) {
    pass("Missing-destination fixture", "At least one demo lead has no phone/email for blocked-state QA.");
  } else {
    warn("Missing-destination fixture", "No missing-destination demo lead was found.");
  }

  if (keys.has("ava-duplicate-risk")) {
    pass("Duplicate-risk fixture", "Duplicate-risk demo lead exists.");
  } else {
    fail("Duplicate-risk fixture", "ava-duplicate-risk was not found.");
    failed = true;
  }

  const orphanedActions = actions.filter((action) => action.lead_id && !leadIds.has(action.lead_id));
  if (orphanedActions.length === 0) {
    pass("Orphaned actions", "No automation actions point at missing leads.");
  } else {
    fail("Orphaned actions", `${orphanedActions.length} action(s) point at missing leads.`);
    failed = true;
  }

  const duplicatePendingGroups = Array.from(
    groupBy(
      actions.filter((action) => action.status === "pending_review"),
      (action) => action.dedupe_key
    ).values()
  ).filter((group) => group.length > 1);

  if (duplicatePendingGroups.length === 0) {
    pass("Queue idempotency", "No duplicate pending action dedupe groups were found.");
  } else {
    fail("Queue idempotency", `${duplicatePendingGroups.length} duplicate pending dedupe group(s) found.`);
    failed = true;
  }

  const stalePendingActions = actions.filter(
    (action) => action.status === "pending_review" && (action.review_request_id || action.send_status)
  );
  if (stalePendingActions.length === 0) {
    pass("Stale pending actions", "No pending action already has handled send fields.");
  } else {
    fail("Stale pending actions", `${stalePendingActions.length} pending action(s) look handled.`);
    failed = true;
  }

  const duplicateReviewGroups = Array.from(
    groupBy(reviewRequests, (request) => request.dedupe_key).values()
  ).filter((group) => group.length > 1);
  if (duplicateReviewGroups.length === 0) {
    pass("Review request dedupe", "No duplicate review request dedupe groups were found.");
  } else {
    warn("Review request dedupe", `${duplicateReviewGroups.length} duplicate review dedupe group(s) exist; verify duplicate_prevented outcomes.`);
  }

  if (automations.length > 0) {
    pass("Automations", `${automations.length} automation definitions found.`);
  } else {
    warn("Automations", "No automation definitions found; open /automations to initialize defaults.");
  }

  console.log("");
  console.log(failed ? "Beta verification failed." : "Beta verification completed.");
  console.log("No providers were called. No rows were mutated.");

  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
