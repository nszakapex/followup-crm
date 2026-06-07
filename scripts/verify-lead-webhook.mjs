const appUrl = (
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");
const secret = process.env.INBOUND_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;

if (!secret) {
  console.error("Set INBOUND_WEBHOOK_SECRET before running webhook verification.");
  process.exit(1);
}

const url = `${appUrl}/api/webhooks/leads`;
const externalId = `verify-${Date.now()}`;
const payload = {
  source: "verification_script",
  external_id: externalId,
  name: "Webhook Verification Lead",
  email: `verify-${externalId}@example.test`,
  phone: "5550102000",
  company: "Verification Co",
  message: "Webhook verification payload.",
  service_interest: "Follow-up CRM test",
  metadata: {
    form_id: "verify-script",
    campaign_name: "manual-verification",
  },
};

async function post(body, includeSecret) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(includeSecret ? { "x-webhook-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function assertResponse(label, response, expectedStatus, predicate) {
  const json = await response.json().catch(() => ({}));

  if (response.status !== expectedStatus || !predicate(json)) {
    console.error(`${label} failed`, {
      status: response.status,
      expectedStatus,
      body: json,
    });
    process.exit(1);
  }

  console.log(`${label} passed`, json);
  return json;
}

const unauthorized = await post(payload, false);
await assertResponse(
  "unauthorized request",
  unauthorized,
  401,
  (json) => json.ok === false
);

const created = await post(payload, true);
const createdJson = await assertResponse(
  "valid lead creation",
  created,
  201,
  (json) => json.ok === true && json.created === true && json.duplicate === false
);

const duplicate = await post(payload, true);
await assertResponse(
  "duplicate lead handling",
  duplicate,
  200,
  (json) =>
    json.ok === true &&
    json.created === false &&
    json.duplicate === true &&
    json.lead_id === createdJson.lead_id
);
