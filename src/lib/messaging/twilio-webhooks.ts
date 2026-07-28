import {
  classifyInboundSms,
  getSmsPhoneMatchKeys,
  isTwilioOptOutErrorCode,
  isTruthy,
  toE164,
  validateTwilioSignature,
  type InboundSmsHandling,
} from "@/lib/messaging/sms-compliance-core";
import { helpResponse, optInConfirm, optOutConfirm } from "@/lib/sms/templates";
import { createAdminClient } from "@/lib/supabase/admin";

// Handlers for the Twilio inbound-message and delivery-status webhooks.
// Kept out of the route files (and free of "server-only") so tests can drive
// them with an injected Supabase client.

export type TwilioWebhookDeps = {
  client?: DbClient;
  now?: () => Date;
  /**
   * Retry policy when a status callback finds no matching message row yet.
   * The send path commits the pending row before the provider call, but the
   * SID lands in a second update - a callback can still arrive in that gap.
   */
  statusUpdateRetry?: { attempts: number; delayMs: number };
};

const DEFAULT_STATUS_UPDATE_RETRY = { attempts: 3, delayMs: 400 };

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Structural subset of SupabaseClient so tests can pass a lightweight fake.
type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
};

type TwilioSmsPayload = {
  from: string | null;
  to: string | null;
  body: string | null;
  messageSid: string | null;
};

type BusinessMatch = {
  id: string;
  name: string;
  owner_email: string | null;
  owner_phone: string | null;
  twilio_from_number: string | null;
};

type LeadMatch = {
  id: string;
  phone: string | null;
  phone_e164: string | null;
  status: string;
  opted_out: boolean;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function getClient(deps?: TwilioWebhookDeps): DbClient {
  return deps?.client ?? createAdminClient();
}

function nowIso(deps?: TwilioWebhookDeps) {
  return (deps?.now?.() ?? new Date()).toISOString();
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function twimlResponse(message?: string, status = 200) {
  const body = message
    ? `<Response><Message>${escapeXml(message)}</Message></Response>`
    : "<Response></Response>";

  return new Response(body, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function jsonError(error: string, status: number) {
  return Response.json({ success: false, error }, { status });
}

/**
 * With Advanced Opt-Out enabled on the Twilio Messaging Service (Task 7 of
 * the rollout), Twilio sends the registered STOP/START/HELP confirmations at
 * the carrier level, so the app must stay silent to avoid double replies.
 */
function advancedOptOutEnabled() {
  return isTruthy(process.env.TWILIO_ADVANCED_OPT_OUT);
}

function getString(params: Record<string, unknown>, key: string) {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json || Array.isArray(json)) return null;

    const params = {
      From: getString(json, "From") ?? getString(json, "from"),
      To: getString(json, "To") ?? getString(json, "to"),
      Body: getString(json, "Body") ?? getString(json, "body"),
      MessageSid: getString(json, "MessageSid") ?? getString(json, "messageSid"),
    };

    return {
      payload: toPayload(params),
      signatureParams: Object.fromEntries(
        Object.entries(params).filter(([, value]) => Boolean(value))
      ) as Record<string, string>,
    };
  }

  const text = await request.text();
  const form = new URLSearchParams(text);
  const signatureParams = Object.fromEntries(form.entries());

  return {
    payload: toPayload(signatureParams),
    signatureParams,
  };
}

function toPayload(params: Record<string, string | null>): TwilioSmsPayload {
  return {
    from: params.From ?? null,
    to: params.To ?? null,
    body: params.Body ?? null,
    messageSid: params.MessageSid ?? null,
  };
}

function getValidationUrl(request: Request) {
  const publicOrigin =
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!publicOrigin) return request.url;

  const incomingUrl = new URL(request.url);
  return `${publicOrigin.replace(/\/$/, "")}${incomingUrl.pathname}${incomingUrl.search}`;
}

function shouldRequireSignature() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.TWILIO_WEBHOOK_VALIDATE_SIGNATURE === "true"
  );
}

function signaturesEnabled() {
  return Boolean(process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Shared signature check. Returns a Response to short-circuit with, or null
 * when the request may proceed.
 */
function checkSignature(
  request: Request,
  signatureParams: Record<string, string>
): Response | null {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("x-twilio-signature");

  if (authToken && signature) {
    const valid = validateTwilioSignature({
      authToken,
      url: getValidationUrl(request),
      params: signatureParams,
      signature,
    });

    if (!valid) return jsonError("Invalid Twilio signature.", 403);
    return null;
  }

  if (shouldRequireSignature()) {
    return jsonError("Twilio signature validation is required.", 403);
  }

  if (!signaturesEnabled() && isDevelopment()) {
    console.warn("[twilio.webhook] Signature validation skipped because TWILIO_AUTH_TOKEN is missing.");
  }

  return null;
}

async function resolveBusinessByToNumber(client: DbClient, to: string | null) {
  const toKeys = new Set(to ? getSmsPhoneMatchKeys(to) : []);

  if (toKeys.size > 0) {
    const { data, error } = await client
      .from("businesses")
      .select("id, name, owner_email, owner_phone, twilio_from_number")
      .not("twilio_from_number", "is", null);

    if (!error) {
      const matches = ((data ?? []) as BusinessMatch[]).filter((business) =>
        getSmsPhoneMatchKeys(business.twilio_from_number).some((key) => toKeys.has(key))
      );

      if (matches.length === 1) return { business: matches[0], error: null };
      if (matches.length > 1) {
        return { business: null, error: "Multiple businesses match the inbound Twilio number." };
      }
    }
  }

  // Messaging Service numbers may not be stored as twilio_from_number. Fall
  // back to the single-business convention the lead webhook uses.
  const configuredId =
    process.env.INBOUND_WEBHOOK_BUSINESS_ID || process.env.WEBHOOK_BUSINESS_ID || null;

  if (configuredId) {
    const { data, error } = await client
      .from("businesses")
      .select("id, name, owner_email, owner_phone, twilio_from_number")
      .eq("id", configuredId)
      .maybeSingle();

    if (error) return { business: null, error: error.message };
    if (data) return { business: data as BusinessMatch, error: null };
  }

  const { data, error } = await client
    .from("businesses")
    .select("id, name, owner_email, owner_phone, twilio_from_number")
    .limit(2);

  if (error) return { business: null, error: error.message };
  if (data && data.length === 1) return { business: data[0] as BusinessMatch, error: null };

  return { business: null, error: "No business matches the inbound Twilio number." };
}

async function resolveLeadByFromNumber(client: DbClient, businessId: string, from: string) {
  const fromE164 = toE164(from);

  if (fromE164) {
    const { data, error } = await client
      .from("leads")
      .select("id, phone, phone_e164, status, opted_out")
      .eq("business_id", businessId)
      .eq("phone_e164", fromE164)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) return { lead: data as LeadMatch, error: null };
  }

  // Fallback for rows created before phone_e164 existed.
  const fromKeys = new Set(getSmsPhoneMatchKeys(from));
  const { data, error } = await client
    .from("leads")
    .select("id, phone, phone_e164, status, opted_out")
    .eq("business_id", businessId)
    .not("phone", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (error) return { lead: null, error: error.message };

  const matches = ((data ?? []) as LeadMatch[]).filter((lead) =>
    getSmsPhoneMatchKeys(lead.phone).some((key) => fromKeys.has(key))
  );

  return { lead: matches[0] ?? null, error: null };
}

async function hasExistingMessage(client: DbClient, businessId: string, messageSid: string | null) {
  if (!messageSid) return false;

  const { data, error } = await client
    .from("messages")
    .select("id")
    .eq("business_id", businessId)
    .eq("provider", "twilio")
    .eq("provider_message_id", messageSid)
    .maybeSingle();

  if (error && isDevelopment()) {
    console.warn("[twilio.sms] Message idempotency lookup failed", {
      businessId,
      error: error.message,
    });
  }

  return Boolean(data);
}

async function logInboundSms({
  client,
  businessId,
  leadId,
  body,
  messageSid,
  handledAs,
  receivedAt,
}: {
  client: DbClient;
  businessId: string;
  leadId: string;
  body: string;
  messageSid: string | null;
  handledAs: InboundSmsHandling;
  receivedAt: string;
}) {
  const errorMessage =
    handledAs === "opt_out"
      ? "Opt-out keyword received. Future SMS is blocked for this lead."
      : handledAs === "opt_in"
        ? "Opt-in keyword received. SMS is re-enabled for this lead."
        : handledAs === "help"
          ? "Help keyword received. Operator follow-up may be needed."
          : null;

  const { error } = await client.from("messages").insert({
    business_id: businessId,
    lead_id: leadId,
    channel: "sms",
    direction: "inbound",
    body: body.slice(0, 4000),
    status: "received",
    provider: "twilio",
    provider_message_id: messageSid,
    received_at: receivedAt,
    error_message: errorMessage,
    kind: "inbound",
  });

  return error;
}

async function logOwnerInboundSms({
  client,
  businessId,
  body,
  messageSid,
  receivedAt,
}: {
  client: DbClient;
  businessId: string;
  body: string;
  messageSid: string | null;
  receivedAt: string;
}) {
  const { error } = await client.from("messages").insert({
    business_id: businessId,
    lead_id: null,
    channel: "sms",
    direction: "inbound",
    body: body.slice(0, 4000),
    status: "received",
    provider: "twilio",
    provider_message_id: messageSid,
    received_at: receivedAt,
    error_message: "Inbound SMS from the business owner's phone. No lead processing applied.",
    kind: "inbound",
  });

  return error;
}

async function upsertSuppression(
  client: DbClient,
  businessId: string,
  phoneE164: string | null,
  reason: string
) {
  if (!phoneE164) return;

  const { error } = await client
    .from("sms_suppressions")
    .upsert(
      { business_id: businessId, phone_e164: phoneE164, reason },
      { onConflict: "business_id,phone_e164" }
    );

  if (error && isDevelopment()) {
    console.warn("[twilio.sms] Failed to upsert suppression", {
      businessId,
      error: error.message,
    });
  }
}

async function removeSuppression(client: DbClient, businessId: string, phoneE164: string | null) {
  if (!phoneE164) return;

  const { error } = await client
    .from("sms_suppressions")
    .delete()
    .eq("business_id", businessId)
    .eq("phone_e164", phoneE164);

  if (error && isDevelopment()) {
    console.warn("[twilio.sms] Failed to remove suppression", {
      businessId,
      error: error.message,
    });
  }
}

/**
 * Any inbound reply stops the automated follow-up sequence: pending SMS
 * follow-up actions are dismissed so the scheduled run cannot send them.
 */
async function dismissPendingSmsFollowUps(
  client: DbClient,
  businessId: string,
  leadId: string,
  dismissedAt: string
) {
  const { error } = await client
    .from("automation_actions")
    .update({ status: "dismissed", dismissed_at: dismissedAt })
    .eq("business_id", businessId)
    .eq("lead_id", leadId)
    .eq("status", "pending_review")
    .eq("channel", "sms")
    .eq("action_type", "follow_up_message");

  if (error && isDevelopment()) {
    console.warn("[twilio.sms] Failed to dismiss pending follow-ups", {
      businessId,
      leadId,
      error: error.message,
    });
  }
}

async function updateLeadForInboundSms({
  client,
  businessId,
  leadId,
  handledAs,
  timestamp,
}: {
  client: DbClient;
  businessId: string;
  leadId: string;
  handledAs: InboundSmsHandling;
  timestamp: string;
}) {
  const update =
    handledAs === "opt_out"
      ? {
          opted_out: true,
          sms_consent_status: "opted_out",
          sms_opt_out_at: timestamp,
        }
      : handledAs === "opt_in"
        ? {
            opted_out: false,
            sms_consent_status: "opted_in",
            sms_consent_source: "inbound_sms",
            sms_consent_at: timestamp,
          }
        : { status: "needs_reply" };

  const { error } = await client
    .from("leads")
    .update(update)
    .eq("id", leadId)
    .eq("business_id", businessId);

  return error;
}

async function logAuditEvent({
  client,
  businessId,
  leadId,
  handledAs,
  messageSid,
  timestamp,
}: {
  client: DbClient;
  businessId: string;
  leadId: string;
  handledAs: string;
  messageSid: string | null;
  timestamp: string;
}) {
  const action =
    handledAs === "opt_out"
      ? "sms.opt_out_received"
      : handledAs === "opt_in"
        ? "sms.opt_in_received"
        : "sms.inbound_received";

  const { error } = await client.from("audit_logs").insert({
    business_id: businessId,
    user_id: null,
    action,
    entity_type: "lead",
    entity_id: leadId,
    metadata_json: {
      businessId,
      leadId,
      provider: "twilio",
      providerMessageId: messageSid,
      handledAs,
      timestamp,
    },
  });

  if (error && isDevelopment()) {
    console.warn("[twilio.sms] Failed to log audit event", {
      businessId,
      leadId,
      error: error.message,
    });
  }
}

function getHelpMessage(business: BusinessMatch) {
  return helpResponse({
    businessName: business.name,
    businessPhone: business.owner_phone || business.owner_email,
  });
}

export async function handleTwilioInboundSms(
  request: Request,
  deps?: TwilioWebhookDeps
): Promise<Response> {
  const parsed = await parsePayload(request);

  if (!parsed) {
    return jsonError("Invalid Twilio SMS webhook payload.", 400);
  }

  const signatureFailure = checkSignature(request, parsed.signatureParams);
  if (signatureFailure) return signatureFailure;

  const { from, to, body, messageSid } = parsed.payload;

  if (!from || !to || !body) {
    return jsonError("Twilio SMS payload requires From, To, and Body.", 400);
  }

  const client = getClient(deps);
  const timestamp = nowIso(deps);
  const handledAs = classifyInboundSms(body);
  const fromE164 = toE164(from);
  const businessMatch = await resolveBusinessByToNumber(client, to);

  if (!businessMatch.business) {
    if (isDevelopment()) {
      console.warn("[twilio.sms] Inbound SMS did not match a business", {
        reason: businessMatch.error,
        hasFrom: Boolean(from),
        hasTo: Boolean(to),
        hasMessageSid: Boolean(messageSid),
      });
    }

    return twimlResponse();
  }

  const business = businessMatch.business;

  // The owner texting their own business line is operational traffic, not a
  // lead conversation: log it and stop. No keyword handling (a STOP here must
  // not suppress the owner's number), no lead matching, no needs_reply loops.
  const ownerPhoneE164 = toE164(business.owner_phone);
  if (ownerPhoneE164 && fromE164 && ownerPhoneE164 === fromE164) {
    const alreadyStored = await hasExistingMessage(client, business.id, messageSid);

    if (!alreadyStored) {
      const ownerLogError = await logOwnerInboundSms({
        client,
        businessId: business.id,
        body,
        messageSid,
        receivedAt: timestamp,
      });

      if (ownerLogError && isDevelopment()) {
        console.warn("[twilio.sms] Failed to log owner inbound SMS", {
          businessId: business.id,
          error: ownerLogError.message,
        });
      }
    }

    return twimlResponse();
  }

  // Opt-outs are honored even when no lead row matches - the suppression
  // list is phone-level and must survive lead deletion.
  if (handledAs === "opt_out") {
    await upsertSuppression(client, business.id, fromE164, "stop_keyword");
  }

  if (handledAs === "opt_in") {
    await removeSuppression(client, business.id, fromE164);
  }

  const leadMatch = await resolveLeadByFromNumber(client, business.id, from);

  if (!leadMatch.lead) {
    if (isDevelopment()) {
      console.warn("[twilio.sms] Inbound SMS did not match a lead", {
        businessId: business.id,
        reason: leadMatch.error ?? "No lead phone matched inbound From number.",
        hasMessageSid: Boolean(messageSid),
      });
    }

    if (handledAs === "help" && !advancedOptOutEnabled()) {
      return twimlResponse(getHelpMessage(business));
    }

    return twimlResponse();
  }

  const alreadyStored = await hasExistingMessage(client, business.id, messageSid);
  if (alreadyStored) {
    if (handledAs === "help" && !advancedOptOutEnabled()) {
      return twimlResponse(getHelpMessage(business));
    }

    return twimlResponse();
  }

  const messageError = await logInboundSms({
    client,
    businessId: business.id,
    leadId: leadMatch.lead.id,
    body,
    messageSid,
    handledAs,
    receivedAt: timestamp,
  });

  if (messageError) {
    return jsonError("Failed to store inbound SMS.", 500);
  }

  // HELP is log-only: the keyword is answered automatically (by Twilio's
  // Advanced Opt-Out or the TwiML below) and is not a conversational reply.
  const leadUpdateError =
    handledAs === "help"
      ? null
      : await updateLeadForInboundSms({
          client,
          businessId: business.id,
          leadId: leadMatch.lead.id,
          handledAs,
          timestamp,
        });

  if (leadUpdateError && isDevelopment()) {
    console.warn("[twilio.sms] Failed to update lead after inbound SMS", {
      businessId: business.id,
      leadId: leadMatch.lead.id,
      handledAs,
      error: leadUpdateError.message,
    });
  }

  if (handledAs === "opt_out" || handledAs === "normal_reply") {
    await dismissPendingSmsFollowUps(client, business.id, leadMatch.lead.id, timestamp);
  }

  await logAuditEvent({
    client,
    businessId: business.id,
    leadId: leadMatch.lead.id,
    handledAs,
    messageSid,
    timestamp,
  });

  if (advancedOptOutEnabled()) {
    // Twilio's Advanced Opt-Out sends the registered confirmations.
    return twimlResponse();
  }

  if (handledAs === "opt_out") {
    return twimlResponse(optOutConfirm({ businessName: business.name }));
  }

  if (handledAs === "opt_in") {
    return twimlResponse(optInConfirm({ businessName: business.name }));
  }

  if (handledAs === "help") {
    return twimlResponse(getHelpMessage(business));
  }

  return twimlResponse();
}

const STATUS_MAP: Record<string, "pending" | "sent" | "delivered" | "failed"> = {
  queued: "pending",
  accepted: "pending",
  scheduled: "pending",
  sending: "pending",
  sent: "sent",
  delivered: "delivered",
  read: "delivered",
  undelivered: "failed",
  failed: "failed",
};

export async function handleTwilioStatusCallback(
  request: Request,
  deps?: TwilioWebhookDeps
): Promise<Response> {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>;

  const signatureFailure = checkSignature(request, params);
  if (signatureFailure) return signatureFailure;

  const sid = params.MessageSid || params.SmsSid || null;
  // Always 200 on no-op paths: Twilio retries non-2xx callbacks.
  if (!sid) return new Response(null, { status: 200 });

  const twilioStatus = (params.MessageStatus || params.SmsStatus || "").toLowerCase();
  const mappedStatus = STATUS_MAP[twilioStatus] ?? null;
  const parsedErrorCode = Number.parseInt(params.ErrorCode ?? "", 10);
  const errorCode = Number.isNaN(parsedErrorCode) ? null : parsedErrorCode;

  const client = getClient(deps);
  const update: Record<string, unknown> = {};

  if (mappedStatus) update.status = mappedStatus;
  if (errorCode !== null) update.error_code = errorCode;
  if (mappedStatus === "failed") {
    update.error_message = errorCode
      ? `Twilio delivery failed with error ${errorCode}.`
      : "Twilio delivery failed.";
  }

  if (Object.keys(update).length === 0) return new Response(null, { status: 200 });

  // Retry on zero matches: the callback can beat the send path's SID update
  // by a beat even though the pending row itself is committed pre-send.
  const retry = deps?.statusUpdateRetry ?? DEFAULT_STATUS_UPDATE_RETRY;
  let message: { business_id: string; lead_id: string | null } | undefined;

  for (let attempt = 1; attempt <= Math.max(1, retry.attempts); attempt += 1) {
    const { data, error } = await client
      .from("messages")
      .update(update)
      .eq("provider", "twilio")
      .eq("provider_message_id", sid)
      .select("business_id, lead_id");

    if (error) {
      if (isDevelopment()) {
        console.warn("[twilio.status] Failed to update message status", {
          sid,
          error: error.message,
        });
      }

      return new Response(null, { status: 200 });
    }

    message = (data ?? [])[0] as { business_id: string; lead_id: string | null } | undefined;
    if (message) break;
    if (attempt < Math.max(1, retry.attempts)) await sleep(retry.delayMs);
  }

  if (!message) {
    // Unmatched after retries: surface it (in prod too) - these are exactly
    // the stuck-pending rows the reconcile script has to repair otherwise.
    console.warn("[twilio.status] No message row matched status callback", {
      sid,
      status: twilioStatus,
    });

    return new Response(null, { status: 200 });
  }

  // Owner alerts carry no lead; carrier opt-outs only apply to lead traffic.
  if (message.lead_id && isTwilioOptOutErrorCode(errorCode)) {
    const timestamp = nowIso(deps);

    const { data: leadData } = await client
      .from("leads")
      .select("phone_e164, phone")
      .eq("id", message.lead_id)
      .maybeSingle();

    await client
      .from("leads")
      .update({ opted_out: true, sms_consent_status: "opted_out", sms_opt_out_at: timestamp })
      .eq("id", message.lead_id)
      .eq("business_id", message.business_id);

    const lead = leadData as { phone_e164: string | null; phone: string | null } | null;
    const phoneE164 = lead?.phone_e164 ?? toE164(lead?.phone);
    await upsertSuppression(client, message.business_id, phoneE164, "carrier_21610");
  }

  return new Response(null, { status: 200 });
}
