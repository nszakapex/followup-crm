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
      INBOUND_WEBHOOK_SECRET: "webhook-secret",
      REVIEW_REQUEST_TEST_MODE: "true",
    },
    "development"
  );

  assert.equal(result.mode, "test");
  assert.equal(result.readyForConciergePilot, true);
  assert.equal(JSON.stringify(result).includes("anon-value-123"), false);
  assert.equal(JSON.stringify(result).includes("service-value-123"), false);
});

test("env validation allows mock SMS without Twilio configuration", () => {
  const result = validateEnvironment(
    {
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-value-123",
      SUPABASE_SERVICE_ROLE_KEY: "service-value-123",
      INBOUND_WEBHOOK_SECRET: "webhook-secret",
      SMS_ENABLED: "false",
      SMS_PROVIDER: "mock",
      REVIEW_REQUEST_TEST_MODE: "true",
    },
    "development"
  );

  const smsCheck = result.checks.find((check) => check.id === "sms_provider");

  assert.equal(result.readyForConciergePilot, true);
  assert.equal(smsCheck?.status, "pass");
  assert.match(smsCheck?.explanation ?? "", /Mock SMS/);
});

test("env validation fails SMS safely when Twilio is selected without config", () => {
  const result = validateEnvironment(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      NEXT_PUBLIC_APP_URL: "https://crm.example.com",
      AUTOMATION_RUN_SECRET: "secret",
      INBOUND_WEBHOOK_SECRET: "webhook-secret",
      RESEND_API_KEY: "resend-key",
      RESEND_FROM_EMAIL: "leads@example.com",
      OWNER_NOTIFY_EMAIL: "owner@example.com",
      SMS_ENABLED: "true",
      SMS_PROVIDER: "twilio",
      REVIEW_REQUEST_TEST_MODE: "false",
      REVIEW_REQUEST_SKIP_DELIVERY: "false",
    },
    "production"
  );

  const smsCheck = result.checks.find((check) => check.id === "sms_provider");

  assert.equal(result.status, "warning");
  assert.equal(smsCheck?.status, "warning");
  assert.match(smsCheck?.explanation ?? "", /Twilio SMS is selected but not configured/);
});

test("env validation blocks live SMS when compliance is not approved", () => {
  const result = validateEnvironment(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      NEXT_PUBLIC_APP_URL: "https://crm.example.com",
      AUTOMATION_RUN_SECRET: "secret",
      INBOUND_WEBHOOK_SECRET: "webhook-secret",
      RESEND_API_KEY: "resend-key",
      RESEND_FROM_EMAIL: "leads@example.com",
      OWNER_NOTIFY_EMAIL: "owner@example.com",
      SMS_ENABLED: "true",
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "account-value",
      TWILIO_AUTH_TOKEN: "token-value",
      TWILIO_FROM_NUMBER: "+15550101001",
      REVIEW_REQUEST_TEST_MODE: "false",
      REVIEW_REQUEST_SKIP_DELIVERY: "false",
    },
    "production"
  );

  const smsCheck = result.checks.find((check) => check.id === "sms_provider");

  assert.equal(smsCheck?.status, "warning");
  assert.match(smsCheck?.explanation ?? "", /compliance is approved/);
  assert.equal(JSON.stringify(result).includes("token-value"), false);
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
      INBOUND_WEBHOOK_SECRET: "webhook-secret",
      REVIEW_REQUEST_TEST_MODE: "false",
      REVIEW_REQUEST_SKIP_DELIVERY: "false",
    },
    "production"
  );

  assert.equal(result.mode, "live");
  assert.equal(result.status, "blocked");
  assert.equal(
    result.checks.find((check) => check.id === "delivery_safety_mode")?.status,
    "warning"
  );
});
