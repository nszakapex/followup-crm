import assert from "node:assert/strict";
import test from "node:test";

import { validateEnvironment } from "../src/lib/env/validation-core";

test("production env validation blocks missing required server configuration", () => {
  const result = validateEnvironment({}, "production");

  assert.equal(result.status, "blocked");
  assert.equal(result.readyForConciergePilot, false);
  assert.ok(result.missingRequiredProduction.includes("Supabase project URL"));
  assert.ok(result.missingRequiredProduction.includes("Supabase service role key"));
});

test("env validation treats local test mode as safe non-live delivery", () => {
  const result = validateEnvironment(
    {
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-value-123",
      SUPABASE_SERVICE_ROLE_KEY: "service-value-123",
      REVIEW_REQUEST_TEST_MODE: "true",
    },
    "development"
  );

  assert.equal(result.mode, "test");
  assert.equal(result.readyForConciergePilot, true);
  assert.equal(JSON.stringify(result).includes("anon-value-123"), false);
  assert.equal(JSON.stringify(result).includes("service-value-123"), false);
});

test("env validation detects explicit live mode without exposing values", () => {
  const result = validateEnvironment(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      NEXT_PUBLIC_APP_URL: "https://crm.example.com",
      AUTOMATION_RUN_SECRET: "secret",
      REVIEW_REQUEST_TEST_MODE: "false",
      REVIEW_REQUEST_SKIP_DELIVERY: "false",
    },
    "production"
  );

  assert.equal(result.mode, "live");
  assert.equal(result.status, "warning");
  assert.equal(
    result.checks.find((check) => check.id === "delivery_safety_mode")?.status,
    "warning"
  );
});
