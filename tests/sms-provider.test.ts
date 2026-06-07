import assert from "node:assert/strict";
import test from "node:test";

import { getSelectedSmsProviderName, getSmsProvider } from "../src/lib/sms/provider";
import { sendSms } from "../src/lib/sms";

test("SMS provider defaults to mock when omitted", () => {
  assert.equal(getSelectedSmsProviderName({}), "mock");
  assert.equal(getSelectedSmsProviderName({ NODE_ENV: "test" }), "mock");
});

test("mock SMS provider sends without Twilio environment variables", async () => {
  const result = await sendSms(
    {
      to: "+15550101001",
      body: "Test SMS",
      businessId: "business-1",
      leadId: "lead-1",
    },
    { providerName: "mock" }
  );

  assert.equal(result.provider, "mock");
  assert.equal(result.status, "mocked");
  assert.match(result.providerMessageId ?? "", /^mock_sms_/);
});

test("future SMS providers fail closed until adapters exist", async () => {
  const telnyx = getSmsProvider("telnyx");
  const result = await telnyx.sendSms({
    to: "+15550101001",
    body: "Test SMS",
  });

  assert.equal(result.provider, "telnyx");
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "provider_not_implemented");
});
