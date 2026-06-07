import assert from "node:assert/strict";
import test from "node:test";

import { normalizeLeadPayload, normalizePhone } from "../src/lib/webhooks/lead-payload";

test("normalizes website lead payloads into safe lead fields", () => {
  const result = normalizeLeadPayload({
    fullName: "Sarah Miller",
    phone: "(555) 010-1001",
    email: "SARAH@EXAMPLE.TEST",
    source: "Missed call form",
    message: "Can I book a detail?",
    company: "Miller Homes",
    service_interest: "Interior detail",
    metadata: {
      page: "/contact",
      campaign: "local-service",
      preferred_time: "Friday afternoon",
      token: "should-not-be-kept",
    },
  });

  assert.ok(result);
  assert.equal(result.firstName, "Sarah");
  assert.equal(result.lastName, "Miller");
  assert.equal(result.phone, "5550101001");
  assert.equal(result.email, "sarah@example.test");
  assert.equal(result.company, "Miller Homes");
  assert.equal(result.serviceInterest, "Interior detail");
  assert.equal(result.metadata.page, "/contact");
  assert.equal(result.metadata.campaign, "local-service");
  assert.equal(result.metadata.preferredTime, "Friday afternoon");
  assert.equal(result.metadata.token, undefined);
  assert.equal(result.eventPayload.hasMessage, true);
});

test("rejects non-object webhook payloads", () => {
  assert.equal(normalizeLeadPayload(null), null);
  assert.equal(normalizeLeadPayload("not-json"), null);
  assert.equal(normalizeLeadPayload(["not", "object"]), null);
});

test("normalizes phone numbers for duplicate matching", () => {
  assert.equal(normalizePhone("+1 (555) 010-1001"), "+15550101001");
  assert.equal(normalizePhone("555.010.1001"), "5550101001");
  assert.equal(normalizePhone("no digits"), null);
});
