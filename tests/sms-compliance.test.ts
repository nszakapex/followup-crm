import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyInboundSms,
  formatSmsDestinationForProvider,
  getSmsComplianceApproval,
  getSmsPhoneMatchKeys,
  getSmsReadinessState,
  isHelpKeyword,
  isOptOutKeyword,
  isValidSmsDestination,
  validateTwilioSignature,
} from "../src/lib/messaging/sms-compliance-core";

test("SMS compliance approval requires explicit approved signal", () => {
  assert.equal(getSmsComplianceApproval({}).approved, false);
  assert.equal(getSmsComplianceApproval({ SMS_COMPLIANCE_APPROVED: "true" }).approved, true);
  assert.equal(
    getSmsComplianceApproval({ TWILIO_A2P_CAMPAIGN_STATUS: "approved" }).approved,
    true
  );
  assert.equal(getSmsComplianceApproval({}, "approved").approved, true);
});

test("SMS readiness states block live sends without config or compliance approval", () => {
  assert.equal(
    getSmsReadinessState({
      deliverySkipped: true,
      providerConfigured: false,
      complianceApproved: false,
    }),
    "test_mode"
  );
  assert.equal(
    getSmsReadinessState({
      deliverySkipped: false,
      providerConfigured: false,
      complianceApproved: true,
    }),
    "missing_config"
  );
  assert.equal(
    getSmsReadinessState({
      deliverySkipped: false,
      providerConfigured: true,
      complianceApproved: false,
    }),
    "configured_but_not_approved"
  );
  assert.equal(
    getSmsReadinessState({
      deliverySkipped: false,
      providerConfigured: true,
      complianceApproved: true,
    }),
    "approved_ready_for_manual_test"
  );
});

test("SMS keyword handling classifies STOP, HELP, and normal replies", () => {
  assert.equal(isOptOutKeyword(" STOP. "), true);
  assert.equal(isHelpKeyword("help"), true);
  assert.equal(classifyInboundSms("unsubscribe"), "opt_out");
  assert.equal(classifyInboundSms("HELP"), "help");
  assert.equal(classifyInboundSms("Can you call me?"), "normal_reply");
});

test("SMS phone helpers normalize destinations and match common US formats", () => {
  assert.equal(isValidSmsDestination("+1 (555) 010-1001"), true);
  assert.equal(isValidSmsDestination("12345"), false);
  assert.equal(formatSmsDestinationForProvider("(555) 010-1001"), "+15550101001");
  assert.deepEqual(
    new Set(getSmsPhoneMatchKeys("+1 (555) 010-1001")),
    new Set(["15550101001", "+15550101001", "5550101001"])
  );
});

test("Twilio signature validation accepts matching signatures and rejects mismatches", () => {
  const authToken = "test-token";
  const url = "https://crm.example.com/api/webhooks/twilio/sms";
  const params = {
    Body: "Hello",
    From: "+15550101001",
    MessageSid: "SM123",
    To: "+15550101002",
  };
  const signature = "8EzoAIRlYQmnV9E6n20her6Y/E0=";

  assert.equal(validateTwilioSignature({ authToken, url, params, signature }), true);
  assert.equal(
    validateTwilioSignature({
      authToken,
      url,
      params: { ...params, Body: "Changed" },
      signature,
    }),
    false
  );
});
