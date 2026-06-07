import assert from "node:assert/strict";
import test from "node:test";

import { authorizeSharedSecret } from "../src/lib/webhooks/secret";

test("generic lead webhook secret helper rejects missing header", () => {
  const result = authorizeSharedSecret({
    request: new Request("http://localhost:3000/api/webhooks/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
    expectedSecret: "unit-test-webhook-secret",
    headerName: "x-webhook-secret",
    missingConfigurationError: "missing",
    invalidSecretError: "invalid",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("generic lead webhook secret helper accepts x-webhook-secret", () => {
  const result = authorizeSharedSecret({
    request: new Request("http://localhost:3000/api/webhooks/leads", {
      method: "POST",
      headers: { "x-webhook-secret": "unit-test-webhook-secret" },
    }),
    expectedSecret: "unit-test-webhook-secret",
    headerName: "x-webhook-secret",
    missingConfigurationError: "missing",
    invalidSecretError: "invalid",
  });

  assert.equal(result.ok, true);
});
