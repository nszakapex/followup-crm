import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  handleTwilioInboundSms,
  handleTwilioStatusCallback,
} from "../src/lib/messaging/twilio-webhooks";

const BUSINESS = {
  id: "b1000000-0000-4000-8000-000000000001",
  name: "96 Mobile Detailing",
  owner_email: "owner@example.com",
  owner_phone: "+15550100000",
  twilio_from_number: "+15550100111",
};

const LEAD = {
  id: "a1000000-0000-4000-8000-000000000002",
  phone: "+15550100200",
  phone_e164: "+15550100200",
  status: "contacted",
  opted_out: false,
};

type WriteCall = {
  table: string;
  op: "insert" | "update" | "upsert" | "delete";
  values: unknown;
  filters: Record<string, unknown>;
};

type FakeDb = {
  client: { from(table: string): unknown };
  writes: WriteCall[];
  writesTo(table: string, op?: WriteCall["op"]): WriteCall[];
};

/**
 * Minimal thenable query builder covering the chains the handlers use.
 * Reads resolve from the provided table data; writes are recorded.
 */
function createFakeDb(tables: {
  businesses?: unknown[];
  leads?: unknown[];
  messages?: unknown[];
  updatedMessages?: unknown[];
}): FakeDb {
  const writes: WriteCall[] = [];

  function makeQuery(table: string) {
    const state = {
      op: "select" as WriteCall["op"] | "select",
      values: null as unknown,
      filters: {} as Record<string, unknown>,
      single: false,
      selectAfterWrite: false,
    };

    const query = {
      select() {
        if (state.op !== "select") state.selectAfterWrite = true;
        return query;
      },
      insert(values: unknown) {
        state.op = "insert";
        state.values = values;
        return query;
      },
      update(values: unknown) {
        state.op = "update";
        state.values = values;
        return query;
      },
      upsert(values: unknown) {
        state.op = "upsert";
        state.values = values;
        return query;
      },
      delete() {
        state.op = "delete";
        return query;
      },
      eq(column: string, value: unknown) {
        state.filters[column] = value;
        return query;
      },
      neq() {
        return query;
      },
      not() {
        return query;
      },
      in() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      maybeSingle() {
        state.single = true;
        return query;
      },
      then(
        resolve: (result: { data: unknown; error: null }) => unknown,
        reject?: (reason: unknown) => unknown
      ) {
        void reject;
        if (state.op !== "select") {
          writes.push({
            table,
            op: state.op,
            values: state.values,
            filters: state.filters,
          });

          const data =
            state.op === "update" && table === "messages"
              ? (tables.updatedMessages ?? [])
              : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        }

        let rows = (tables[table as keyof typeof tables] ?? []) as Record<string, unknown>[];
        for (const [column, value] of Object.entries(state.filters)) {
          rows = rows.filter((row) => !(column in row) || row[column] === value);
        }

        const data = state.single ? (rows[0] ?? null) : rows;
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };

    return query;
  }

  return {
    client: { from: (table: string) => makeQuery(table) },
    writes,
    writesTo(table, op) {
      return writes.filter((call) => call.table === table && (!op || call.op === op));
    },
  };
}

function formRequest(body: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhooks/twilio/sms", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
  });
}

function inboundBody(overrides: Record<string, string> = {}) {
  return {
    From: LEAD.phone,
    To: BUSINESS.twilio_from_number,
    Body: "Hello",
    MessageSid: "SM123",
    ...overrides,
  };
}

function withCleanTwilioEnv(fn: () => Promise<void>) {
  return async () => {
    const saved = {
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
      TWILIO_WEBHOOK_VALIDATE_SIGNATURE: process.env.TWILIO_WEBHOOK_VALIDATE_SIGNATURE,
      TWILIO_ADVANCED_OPT_OUT: process.env.TWILIO_ADVANCED_OPT_OUT,
      APP_URL: process.env.APP_URL,
    };

    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_WEBHOOK_VALIDATE_SIGNATURE;
    delete process.env.TWILIO_ADVANCED_OPT_OUT;
    delete process.env.APP_URL;

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

test(
  "STOP revokes consent, suppresses the phone, and dismisses queued follow-ups",
  withCleanTwilioEnv(async () => {
    const db = createFakeDb({ businesses: [BUSINESS], leads: [LEAD], messages: [] });
    const response = await handleTwilioInboundSms(
      formRequest(inboundBody({ Body: "STOP" })),
      { client: db.client }
    );

    assert.equal(response.status, 200);
    assert.match(await response.text(), /unsubscribed/i);

    const suppression = db.writesTo("sms_suppressions", "upsert");
    assert.equal(suppression.length, 1);
    assert.deepEqual(suppression[0].values, {
      business_id: BUSINESS.id,
      phone_e164: LEAD.phone_e164,
      reason: "stop_keyword",
    });

    const leadUpdate = db.writesTo("leads", "update")[0].values as Record<string, unknown>;
    assert.equal(leadUpdate.opted_out, true);
    assert.equal(leadUpdate.sms_consent_status, "opted_out");
    assert.ok(leadUpdate.sms_opt_out_at);

    const dismissals = db.writesTo("automation_actions", "update");
    assert.equal(dismissals.length, 1);
    assert.equal((dismissals[0].values as Record<string, unknown>).status, "dismissed");

    const inserted = db.writesTo("messages", "insert")[0].values as Record<string, unknown>;
    assert.equal(inserted.direction, "inbound");
    assert.equal(inserted.provider_message_id, "SM123");
  })
);

test(
  "START re-opts the lead in and clears the suppression",
  withCleanTwilioEnv(async () => {
    const db = createFakeDb({ businesses: [BUSINESS], leads: [LEAD], messages: [] });
    const response = await handleTwilioInboundSms(
      formRequest(inboundBody({ Body: "START", MessageSid: "SM124" })),
      { client: db.client }
    );

    assert.equal(response.status, 200);

    assert.equal(db.writesTo("sms_suppressions", "delete").length, 1);

    const leadUpdate = db.writesTo("leads", "update")[0].values as Record<string, unknown>;
    assert.equal(leadUpdate.opted_out, false);
    assert.equal(leadUpdate.sms_consent_status, "opted_in");
    assert.equal(leadUpdate.sms_consent_source, "inbound_sms");
  })
);

test(
  "HELP is logged without changing consent and answers with the help copy",
  withCleanTwilioEnv(async () => {
    const db = createFakeDb({ businesses: [BUSINESS], leads: [LEAD], messages: [] });
    const response = await handleTwilioInboundSms(
      formRequest(inboundBody({ Body: "HELP", MessageSid: "SM125" })),
      { client: db.client }
    );

    assert.equal(response.status, 200);
    assert.match(await response.text(), /for help/i);
    assert.equal(db.writesTo("leads", "update").length, 0);
    assert.equal(db.writesTo("sms_suppressions").length, 0);
    assert.equal(db.writesTo("messages", "insert").length, 1);
  })
);

test(
  "a plain reply marks the lead needs_reply and stops the sequence",
  withCleanTwilioEnv(async () => {
    const db = createFakeDb({ businesses: [BUSINESS], leads: [LEAD], messages: [] });
    const response = await handleTwilioInboundSms(
      formRequest(inboundBody({ Body: "Can you do Saturday?", MessageSid: "SM126" })),
      { client: db.client }
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "<Response></Response>");

    const leadUpdate = db.writesTo("leads", "update")[0].values as Record<string, unknown>;
    assert.deepEqual(leadUpdate, { status: "needs_reply" });
    assert.equal(db.writesTo("automation_actions", "update").length, 1);
  })
);

test(
  "an invalid signature is rejected with 403 when validation is enforced",
  withCleanTwilioEnv(async () => {
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    process.env.TWILIO_WEBHOOK_VALIDATE_SIGNATURE = "true";

    const db = createFakeDb({ businesses: [BUSINESS], leads: [LEAD], messages: [] });
    const response = await handleTwilioInboundSms(
      formRequest(inboundBody(), { "x-twilio-signature": "not-a-real-signature" }),
      { client: db.client }
    );

    assert.equal(response.status, 403);
    assert.equal(db.writes.length, 0);
  })
);

test(
  "a valid signature passes when validation is enforced",
  withCleanTwilioEnv(async () => {
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    process.env.TWILIO_WEBHOOK_VALIDATE_SIGNATURE = "true";

    const body = inboundBody({ Body: "Sounds good", MessageSid: "SM127" });
    const url = "http://localhost/api/webhooks/twilio/sms";
    const payload =
      url +
      Object.keys(body)
        .sort()
        .map((key) => `${key}${body[key]}`)
        .join("");
    const signature = createHmac("sha1", "test-token").update(payload).digest("base64");

    const db = createFakeDb({ businesses: [BUSINESS], leads: [LEAD], messages: [] });
    const response = await handleTwilioInboundSms(
      formRequest(body, { "x-twilio-signature": signature }),
      { client: db.client }
    );

    assert.equal(response.status, 200);
    assert.equal(db.writesTo("messages", "insert").length, 1);
  })
);

test(
  "delivery status callback updates the message row by MessageSid",
  withCleanTwilioEnv(async () => {
    const db = createFakeDb({
      updatedMessages: [{ business_id: BUSINESS.id, lead_id: LEAD.id }],
    });
    const request = new Request("http://localhost/api/webhooks/twilio/status", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        MessageSid: "SM200",
        MessageStatus: "delivered",
      }).toString(),
    });

    const response = await handleTwilioStatusCallback(request, { client: db.client });

    assert.equal(response.status, 200);
    const update = db.writesTo("messages", "update")[0];
    assert.deepEqual(update.values, { status: "delivered" });
    assert.equal(update.filters.provider_message_id, "SM200");
  })
);

test(
  "delivery error 21610 records a durable opt-out",
  withCleanTwilioEnv(async () => {
    const db = createFakeDb({
      updatedMessages: [{ business_id: BUSINESS.id, lead_id: LEAD.id }],
      leads: [LEAD],
    });
    const request = new Request("http://localhost/api/webhooks/twilio/status", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        MessageSid: "SM201",
        MessageStatus: "undelivered",
        ErrorCode: "21610",
      }).toString(),
    });

    const response = await handleTwilioStatusCallback(request, { client: db.client });

    assert.equal(response.status, 200);

    const messageUpdate = db.writesTo("messages", "update")[0]
      .values as Record<string, unknown>;
    assert.equal(messageUpdate.status, "failed");
    assert.equal(messageUpdate.error_code, 21610);

    const leadUpdate = db.writesTo("leads", "update")[0].values as Record<string, unknown>;
    assert.equal(leadUpdate.opted_out, true);
    assert.equal(leadUpdate.sms_consent_status, "opted_out");

    const suppression = db.writesTo("sms_suppressions", "upsert")[0]
      .values as Record<string, unknown>;
    assert.equal(suppression.reason, "carrier_21610");
    assert.equal(suppression.phone_e164, LEAD.phone_e164);
  })
);
