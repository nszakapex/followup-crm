import assert from "node:assert/strict";
import test from "node:test";

import {
  SEQUENCE_STEP_KINDS,
  insertPendingOutboundSms,
  applyProviderOutcomeToOutboundSms,
} from "../src/lib/messaging/outbound-log";
import {
  buildOwnerLeadAlertBody,
  sendOwnerLeadAlertSms,
} from "../src/lib/messaging/owner-alerts";

const BUSINESS = {
  id: "b1000000-0000-4000-8000-000000000001",
  owner_phone: "+19708890476",
  owner_sms_alerts: true,
  twilio_from_number: "+15550100111",
};

const LEAD = {
  id: "a1000000-0000-4000-8000-000000000002",
  name: "Jane Doe",
  phone: "+15550100200",
  serviceInterest: "full detail",
};

type RecordedCall = { table: string; op: "insert" | "update"; values: Record<string, unknown> };

/**
 * Minimal fake client for the outbound-log chains:
 * insert().select().single() and update().eq(). Records call order so tests
 * can assert the pending row is committed before the provider is invoked.
 */
function createFakeLogClient(options: { failInsert?: boolean } = {}) {
  const calls: RecordedCall[] = [];

  return {
    calls,
    client: {
      from(table: string) {
        const chain = {
          _op: "" as "insert" | "update",
          _values: {} as Record<string, unknown>,
          insert(values: Record<string, unknown>) {
            chain._op = "insert";
            chain._values = values;
            return chain;
          },
          update(values: Record<string, unknown>) {
            chain._op = "update";
            chain._values = values;
            return chain;
          },
          select() {
            return chain;
          },
          eq() {
            return chain;
          },
          single() {
            calls.push({ table, op: chain._op, values: chain._values });
            if (options.failInsert) {
              return Promise.resolve({ data: null, error: { message: "insert failed" } });
            }
            return Promise.resolve({ data: { id: "msg-1" }, error: null });
          },
          then(
            resolve: (result: { data: unknown; error: null }) => unknown,
            reject?: (reason: unknown) => unknown
          ) {
            void reject;
            calls.push({ table, op: chain._op, values: chain._values });
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };

        return chain;
      },
    },
  };
}

function withOwnerAlertEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  return async () => {
    const keys = [
      "SMS_ENABLED",
      "SMS_PROVIDER",
      "REVIEW_REQUEST_TEST_MODE",
      "REVIEW_REQUEST_SKIP_DELIVERY",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_MESSAGING_SERVICE_SID",
      "APP_URL",
    ];
    const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

    for (const key of keys) delete process.env[key];
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") process.env[key] = value;
    }

    try {
      await fn();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (typeof value === "undefined") delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
}

const LIVE_ENV = {
  SMS_ENABLED: "true",
  SMS_PROVIDER: "mock",
  REVIEW_REQUEST_TEST_MODE: "false",
  REVIEW_REQUEST_SKIP_DELIVERY: "false",
  APP_URL: "https://crm.example.com",
};

test("owner_alert kind can never advance the follow-up sequence", () => {
  assert.deepEqual([...SEQUENCE_STEP_KINDS], ["first_touch", "followup"]);
  assert.ok(!(SEQUENCE_STEP_KINDS as readonly string[]).includes("owner_alert"));
});

test("owner alert body includes name, service, phone, and dashboard link", () => {
  const body = buildOwnerLeadAlertBody({
    leadName: "Jane Doe",
    serviceInterest: "full detail",
    leadPhone: "+15550100200",
    leadUrl: "https://crm.example.com/leads/a1",
  });

  assert.equal(
    body,
    "New lead: Jane Doe — full detail — +15550100200. Reply from the dashboard: https://crm.example.com/leads/a1"
  );
});

test("owner alert body drops missing pieces instead of rendering blanks", () => {
  const body = buildOwnerLeadAlertBody({
    leadName: null,
    serviceInterest: null,
    leadPhone: "+15550100200",
    leadUrl: null,
  });

  assert.equal(body, "New lead: Unknown — +15550100200.");
});

test(
  "owner alert does not fire when the toggle is off",
  withOwnerAlertEnv(LIVE_ENV, async () => {
    const db = createFakeLogClient();
    const result = await sendOwnerLeadAlertSms({
      business: { ...BUSINESS, owner_sms_alerts: false },
      lead: LEAD,
      deps: { client: db.client },
    });

    assert.deepEqual(result, { attempted: false, sent: false, reason: "alerts_disabled" });
    assert.equal(db.calls.length, 0);
  })
);

test(
  "owner alert does not fire without a valid owner phone",
  withOwnerAlertEnv(LIVE_ENV, async () => {
    const db = createFakeLogClient();
    const result = await sendOwnerLeadAlertSms({
      business: { ...BUSINESS, owner_phone: "not-a-phone" },
      lead: LEAD,
      deps: { client: db.client },
    });

    assert.deepEqual(result, { attempted: false, sent: false, reason: "no_owner_phone" });
    assert.equal(db.calls.length, 0);
  })
);

test(
  "owner alert respects the SMS_ENABLED gate",
  withOwnerAlertEnv({ ...LIVE_ENV, SMS_ENABLED: "false" }, async () => {
    const db = createFakeLogClient();
    const result = await sendOwnerLeadAlertSms({
      business: BUSINESS,
      lead: LEAD,
      deps: { client: db.client },
    });

    assert.deepEqual(result, { attempted: false, sent: false, reason: "sms_disabled" });
    assert.equal(db.calls.length, 0);
  })
);

test(
  "owner alert requires a configured provider",
  withOwnerAlertEnv({ ...LIVE_ENV, SMS_PROVIDER: "twilio" }, async () => {
    // twilio selected but no credentials in env -> not configured.
    const db = createFakeLogClient();
    const result = await sendOwnerLeadAlertSms({
      business: BUSINESS,
      lead: LEAD,
      deps: { client: db.client },
    });

    assert.deepEqual(result, { attempted: false, sent: false, reason: "provider_not_configured" });
    assert.equal(db.calls.length, 0);
  })
);

test(
  "owner alert commits the pending owner_alert row before the provider call",
  withOwnerAlertEnv(LIVE_ENV, async () => {
    const db = createFakeLogClient();
    const order: string[] = [];
    const origPush = db.calls.push.bind(db.calls);
    db.calls.push = (call: RecordedCall) => {
      order.push(`${call.op}:${call.table}`);
      return origPush(call);
    };

    const result = await sendOwnerLeadAlertSms({
      business: BUSINESS,
      lead: LEAD,
      deps: {
        client: db.client,
        sendViaProvider: async () => {
          order.push("provider:send");
          return { status: "sent", providerMessageId: "SM900" };
        },
      },
    });

    assert.deepEqual(result, { attempted: true, sent: true, reason: null });
    assert.deepEqual(order, ["insert:messages", "provider:send", "update:messages"]);

    const inserted = db.calls[0].values;
    assert.equal(inserted.kind, "owner_alert");
    assert.equal(inserted.lead_id, LEAD.id);
    assert.equal(inserted.business_id, BUSINESS.id);
    assert.equal(inserted.status, "pending");
    assert.match(String(inserted.body), /^New lead: Jane Doe — full detail — \+15550100200\./);
    assert.match(String(inserted.body), /https:\/\/crm\.example\.com\/leads\//);

    const updated = db.calls[1].values;
    assert.equal(updated.status, "sent");
    assert.equal(updated.provider_message_id, "SM900");
  })
);

test(
  "owner alert never sends when the pending row cannot be logged",
  withOwnerAlertEnv(LIVE_ENV, async () => {
    const db = createFakeLogClient({ failInsert: true });
    let providerCalled = false;

    const result = await sendOwnerLeadAlertSms({
      business: BUSINESS,
      lead: LEAD,
      deps: {
        client: db.client,
        sendViaProvider: async () => {
          providerCalled = true;
          return { status: "sent", providerMessageId: "SM901" };
        },
      },
    });

    assert.deepEqual(result, { attempted: true, sent: false, reason: "log_failed" });
    assert.equal(providerCalled, false);
  })
);

test(
  "owner alert records provider failures on the logged row",
  withOwnerAlertEnv(LIVE_ENV, async () => {
    const db = createFakeLogClient();
    const result = await sendOwnerLeadAlertSms({
      business: BUSINESS,
      lead: LEAD,
      deps: {
        client: db.client,
        sendViaProvider: async () => ({
          status: "failed",
          providerErrorCode: 30007,
          errorMessage: "Carrier filtered.",
        }),
      },
    });

    assert.deepEqual(result, { attempted: true, sent: false, reason: "delivery_failed" });
    const updated = db.calls[1].values;
    assert.equal(updated.status, "failed");
    assert.equal(updated.error_code, 30007);
  })
);

test("outbound-log helpers insert pending first and apply outcomes by id", async () => {
  const db = createFakeLogClient();

  const pending = await insertPendingOutboundSms(db.client, {
    businessId: BUSINESS.id,
    leadId: LEAD.id,
    body: "Hi",
    provider: "twilio",
    kind: "first_touch",
  });

  assert.equal(pending.id, "msg-1");
  assert.equal(pending.error, null);
  assert.equal(db.calls[0].values.status, "pending");
  assert.equal(db.calls[0].values.provider_message_id, null);

  const applied = await applyProviderOutcomeToOutboundSms(db.client, pending.id!, {
    status: "queued",
    providerMessageId: "SM777",
  });

  assert.equal(applied.error, null);
  const update = db.calls[1].values;
  assert.equal(update.status, "pending");
  assert.equal(update.provider_message_id, "SM777");
  assert.equal(update.sent_at, null);
});
