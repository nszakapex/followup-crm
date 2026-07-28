import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFollowUpEligibility } from "../src/lib/automations/follow-up-eligibility";
import {
  FOLLOW_UP_SEQUENCE_RULES,
  getFollowUpRuleForAutomation,
} from "../src/lib/automations/follow-up-sequences";

const T0 = new Date("2026-07-01T16:00:00Z");

function hoursAfter(hours: number) {
  return new Date(T0.getTime() + hours * 60 * 60 * 1000);
}

const business = {
  id: "b1000000-0000-4000-8000-000000000001",
  name: "96 Mobile Detailing",
  google_review_link: "https://g.page/example/review",
  industry: null,
};

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1000000-0000-4000-8000-000000000002",
    business_id: business.id,
    first_name: "Sarah",
    last_name: "Miller",
    phone: "+15550100200",
    email: "sarah@example.com",
    source: "Website form",
    status: "contacted" as const,
    notes: null,
    opted_out: false,
    created_at: T0.toISOString(),
    last_contacted_at: T0.toISOString(),
    ...overrides,
  };
}

function makeAutomation(type: string, delayHours: number) {
  return {
    type,
    channel: "sms" as const,
    delay_hours: delayHours,
    trigger_status: "contacted",
  };
}

function evaluateAt(type: string, delayHours: number, now: Date, leadOverrides = {}) {
  return evaluateFollowUpEligibility({
    business,
    lead: makeLead(leadOverrides),
    automation: makeAutomation(type, delayHours),
    existingActions: [],
    reviewRequests: [],
    now,
  });
}

test("a contacted lead ages through the day 1 / day 3 / day 7 sequence", () => {
  // Day 1 follow-up: not due at 6h, due at 25h.
  assert.equal(evaluateAt("twenty_four_hour_followup", 24, hoursAfter(6)).eligible, false);
  const day1 = evaluateAt("twenty_four_hour_followup", 24, hoursAfter(25));
  assert.equal(day1.eligible, true);
  assert.equal(day1.actionType, "new_lead_followup_1");

  // Day 3 follow-up: not due at 25h, due at 73h.
  assert.equal(evaluateAt("three_day_followup", 72, hoursAfter(25)).eligible, false);
  const day3 = evaluateAt("three_day_followup", 72, hoursAfter(73));
  assert.equal(day3.eligible, true);
  assert.equal(day3.actionType, "no_response_followup");

  // Day 7 final: not due at 100h, due at 169h, then the sequence has no
  // further steps - max 4 messages per inquiry including the first touch.
  assert.equal(evaluateAt("seven_day_followup", 168, hoursAfter(100)).eligible, false);
  const day7 = evaluateAt("seven_day_followup", 168, hoursAfter(169));
  assert.equal(day7.eligible, true);
  assert.equal(day7.actionType, "new_lead_final");
});

test("a reply at day 2 stops the rest of the sequence", () => {
  // Inbound replies flip the lead to needs_reply, which no follow-up rule
  // matches anymore - the conversation belongs to the operator now.
  for (const [type, delay] of [
    ["twenty_four_hour_followup", 24],
    ["three_day_followup", 72],
    ["seven_day_followup", 168],
  ] as const) {
    const result = evaluateAt(type, delay, hoursAfter(200), { status: "needs_reply" });
    assert.equal(result.eligible, false, `${type} must not fire after a reply`);
  }
});

test("opt-out and progressed leads never receive sequence messages", () => {
  assert.equal(
    evaluateAt("three_day_followup", 72, hoursAfter(73), { opted_out: true }).eligible,
    false
  );
  assert.equal(
    evaluateAt("seven_day_followup", 168, hoursAfter(169), { status: "booked" }).eligible,
    false
  );
});

test("follow-up rules exclude needs_reply and the seven-day rule is registered", () => {
  for (const rule of FOLLOW_UP_SEQUENCE_RULES) {
    assert.equal(
      rule.appliesToStatuses.includes("needs_reply"),
      false,
      `${rule.automationType} must not target needs_reply`
    );
  }

  const sevenDay = getFollowUpRuleForAutomation("seven_day_followup");
  assert.ok(sevenDay);
  assert.equal(sevenDay.recommendedDelayHours, 168);
  assert.equal(sevenDay.actionType, "new_lead_final");
});
