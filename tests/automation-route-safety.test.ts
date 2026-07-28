import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProviderSendRequest,
  parseAutomationBoolean,
} from "../src/lib/automations/route-safety";

test("automation boolean parsing accepts explicit boolean-like values", () => {
  assert.equal(parseAutomationBoolean(undefined, true), true);
  assert.equal(parseAutomationBoolean("true", false), true);
  assert.equal(parseAutomationBoolean("0", true), false);
  assert.equal(parseAutomationBoolean("nope", false), null);
});

test("automation route policy rejects provider sends until the deployment is flipped live", () => {
  const result = evaluateProviderSendRequest(true, {});

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.requested, true);
  assert.match(result.error, /Provider sends are not enabled/);

  // Partial flips stay blocked - all three switches are required.
  assert.equal(evaluateProviderSendRequest(true, { SMS_ENABLED: "true" }).ok, false);
  assert.equal(
    evaluateProviderSendRequest(true, { SMS_ENABLED: "true", SMS_PROVIDER: "twilio" }).ok,
    false
  );
});

test("automation route policy grants provider sends once SMS is live and approved", () => {
  const result = evaluateProviderSendRequest(true, {
    SMS_ENABLED: "true",
    SMS_PROVIDER: "twilio",
    SMS_COMPLIANCE_APPROVED: "true",
  });

  assert.equal(result.ok, true);
  assert.equal(result.requested, true);
});

test("automation route policy allows omitted provider-send flag as blocked-by-default", () => {
  const result = evaluateProviderSendRequest(undefined, {});

  assert.equal(result.ok, true);
  assert.equal(result.requested, false);
});
