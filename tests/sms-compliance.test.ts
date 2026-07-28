import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyInboundSms,
  evaluateSmsSendGate,
  formatSmsDestinationForProvider,
  getSmsComplianceApproval,
  getSmsPhoneMatchKeys,
  getSmsReadinessState,
  isHelpKeyword,
  isOptOutKeyword,
  isSmsProviderSendReady,
  isValidSmsDestination,
  toE164,
  validateTwilioSignature,
} from "../src/lib/messaging/sms-compliance-core";

const LIVE_ENV = {
  SMS_ENABLED: "true",
  SMS_PROVIDER: "twilio",
  SMS_COMPLIANCE_APPROVED: "true",
};

// 17:00 UTC - inside the 8:00-19:59 window for a UTC business timezone.
const MIDDAY = new Date("2026-07-27T17:00:00Z");
// 03:00 UTC - outside the window.
const NIGHT = new Date("2026-07-27T03:00:00Z");

function gateInput(overrides: Partial<Parameters<typeof evaluateSmsSendGate>[0]> = {}) {
  return {
    kind: "followup" as const,
    consentStatus: "opted_in" as const,
    suppressed: false,
    businessTimezone: "UTC",
    now: MIDDAY,
    env: LIVE_ENV,
    ...overrides,
  };
}

test("SMS compliance approval requires explicit approved signal", () => {
  assert.equal(getSmsComplianceApproval({}).approved, false);
  assert.equal(getSmsComplianceApproval({ SMS_COMPLIANCE_APPROVED: "true" }).approved, true);
  assert.equal(getSmsComplianceApproval({ SMS_COMPLIANCE_STATUS: "approved" }).approved, true);
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

test("SMS keyword handling classifies STOP, START, HELP, and normal replies", () => {
  assert.equal(isOptOutKeyword(" STOP. "), true);
  assert.equal(isHelpKeyword("help"), true);
  assert.equal(classifyInboundSms("unsubscribe"), "opt_out");
  assert.equal(classifyInboundSms("START"), "opt_in");
  assert.equal(classifyInboundSms("unstop"), "opt_in");
  assert.equal(classifyInboundSms("HELP"), "help");
  assert.equal(classifyInboundSms("Can you call me?"), "normal_reply");
});

test("toE164 normalizes US and international numbers and rejects invalid input", () => {
  assert.equal(toE164("(555) 010-1001"), "+15550101001");
  assert.equal(toE164("1 555 010 1001"), "+15550101001");
  assert.equal(toE164("+1 (555) 010-1001"), "+15550101001");
  assert.equal(toE164("+44 20 7946 0958"), "+442079460958");
  assert.equal(toE164("12345"), null);
  assert.equal(toE164(""), null);
  assert.equal(toE164(null), null);
});

test("provider-send readiness requires SMS on, a real provider, and compliance approval", () => {
  assert.equal(isSmsProviderSendReady({}), false);
  assert.equal(isSmsProviderSendReady({ SMS_ENABLED: "true" }), false);
  assert.equal(
    isSmsProviderSendReady({ SMS_ENABLED: "true", SMS_PROVIDER: "twilio" }),
    false
  );
  assert.equal(isSmsProviderSendReady(LIVE_ENV), true);
});

test("SMS send gate blocks each failure mode with a loggable reason", () => {
  assert.deepEqual(evaluateSmsSendGate(gateInput({ env: {} })), {
    allowed: false,
    reason: "sms_disabled",
  });
  assert.deepEqual(evaluateSmsSendGate(gateInput({ env: { SMS_ENABLED: "true" } })), {
    allowed: false,
    reason: "provider_mock",
  });
  assert.deepEqual(
    evaluateSmsSendGate(gateInput({ env: { SMS_ENABLED: "true", SMS_PROVIDER: "twilio" } })),
    { allowed: false, reason: "compliance_not_approved" }
  );
  assert.deepEqual(evaluateSmsSendGate(gateInput({ suppressed: true })), {
    allowed: false,
    reason: "suppressed",
  });
  assert.deepEqual(evaluateSmsSendGate(gateInput({ consentStatus: "opted_out" })), {
    allowed: false,
    reason: "opted_out",
  });
  assert.deepEqual(evaluateSmsSendGate(gateInput({ optedOut: true })), {
    allowed: false,
    reason: "opted_out",
  });
  assert.deepEqual(evaluateSmsSendGate(gateInput({ consentStatus: "unknown" })), {
    allowed: false,
    reason: "no_documented_consent",
  });
  assert.deepEqual(evaluateSmsSendGate(gateInput({ outboundSequenceCount: 4 })), {
    allowed: false,
    reason: "sequence_exhausted",
  });
  assert.deepEqual(evaluateSmsSendGate(gateInput({ now: NIGHT })), {
    allowed: false,
    reason: "quiet_hours",
  });
});

test("SMS send gate allows compliant sends and conversational replies", () => {
  assert.deepEqual(evaluateSmsSendGate(gateInput({ outboundSequenceCount: 3 })), {
    allowed: true,
  });

  // A direct reply may go out on unknown consent and ignores quiet hours -
  // the lead just texted us; answering is conversational, not promotional.
  assert.deepEqual(
    evaluateSmsSendGate(
      gateInput({ kind: "reply", consentStatus: "unknown", now: NIGHT })
    ),
    { allowed: true }
  );

  // Opt-out is absolute: even replies are blocked.
  assert.deepEqual(
    evaluateSmsSendGate(gateInput({ kind: "reply", consentStatus: "opted_out" })),
    { allowed: false, reason: "opted_out" }
  );
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
