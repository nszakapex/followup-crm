import { NextResponse } from "next/server";

import {
  classifyInboundSms,
  getSmsPhoneMatchKeys,
  validateTwilioSignature,
} from "@/lib/messaging/sms-compliance-core";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Legacy optional inbound adapter. Core SMS sending now uses the provider-neutral
// src/lib/sms layer, and SMS_PROVIDER=mock does not depend on this route.

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
  status: string;
  opted_out: boolean;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function twimlResponse(message?: string, status = 200) {
  const body = message
    ? `<Response><Message>${escapeXml(message)}</Message></Response>`
    : "<Response></Response>";

  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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
  const publicOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!publicOrigin) return request.url;

  const incomingUrl = new URL(request.url);
  return `${publicOrigin.replace(/\/$/, "")}${incomingUrl.pathname}${incomingUrl.search}`;
}

function shouldRequireSignature() {
  return process.env.NODE_ENV === "production" || process.env.TWILIO_WEBHOOK_VALIDATE_SIGNATURE === "true";
}

function signaturesEnabled() {
  return Boolean(process.env.TWILIO_AUTH_TOKEN);
}

async function resolveBusinessByToNumber(to: string) {
  const supabase = createAdminClient();
  const toKeys = new Set(getSmsPhoneMatchKeys(to));

  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, owner_email, owner_phone, twilio_from_number")
    .not("twilio_from_number", "is", null);

  if (error) return { business: null, error: error.message };

  const matches = ((data ?? []) as BusinessMatch[]).filter((business) =>
    getSmsPhoneMatchKeys(business.twilio_from_number).some((key) => toKeys.has(key))
  );

  if (matches.length !== 1) {
    return {
      business: null,
      error:
        matches.length === 0
          ? "No business matches the inbound Twilio number."
          : "Multiple businesses match the inbound Twilio number.",
    };
  }

  return { business: matches[0], error: null };
}

async function resolveLeadByFromNumber(businessId: string, from: string) {
  const supabase = createAdminClient();
  const fromKeys = new Set(getSmsPhoneMatchKeys(from));

  const { data, error } = await supabase
    .from("leads")
    .select("id, phone, status, opted_out")
    .eq("business_id", businessId)
    .not("phone", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (error) return { lead: null, error: error.message };

  const matches = ((data ?? []) as LeadMatch[]).filter((lead) =>
    getSmsPhoneMatchKeys(lead.phone).some((key) => fromKeys.has(key))
  );

  return {
    lead: matches[0] ?? null,
    error: null,
  };
}

async function hasExistingMessage(businessId: string, messageSid: string | null) {
  if (!messageSid) return false;

  const supabase = createAdminClient();
  const { data, error } = await supabase
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
  businessId,
  leadId,
  body,
  messageSid,
  handledAs,
}: {
  businessId: string;
  leadId: string;
  body: string;
  messageSid: string | null;
  handledAs: "normal_reply" | "opt_out" | "help";
}) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const errorMessage =
    handledAs === "opt_out"
      ? "Opt-out keyword received. Future SMS is blocked for this lead."
      : handledAs === "help"
        ? "Help keyword received. Operator follow-up may be needed."
        : null;

  const { error } = await supabase.from("messages").insert({
    business_id: businessId,
    lead_id: leadId,
    channel: "sms",
    direction: "inbound",
    body: body.slice(0, 4000),
    status: "received",
    provider: "twilio",
    provider_message_id: messageSid,
    received_at: now,
    error_message: errorMessage,
  });

  return error;
}

async function updateLeadForInboundSms({
  businessId,
  leadId,
  handledAs,
}: {
  businessId: string;
  leadId: string;
  handledAs: "normal_reply" | "opt_out" | "help";
}) {
  const supabase = createAdminClient();
  const update =
    handledAs === "opt_out"
      ? { opted_out: true }
      : { status: "needs_reply" };

  const { error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", leadId)
    .eq("business_id", businessId);

  return error;
}

async function logAuditEvent({
  businessId,
  leadId,
  handledAs,
  messageSid,
}: {
  businessId: string;
  leadId: string;
  handledAs: string;
  messageSid: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_logs").insert({
    business_id: businessId,
    user_id: null,
    action: handledAs === "opt_out" ? "sms.opt_out_received" : "sms.inbound_received",
    entity_type: "lead",
    entity_id: leadId,
    metadata_json: {
      businessId,
      leadId,
      provider: "twilio",
      providerMessageId: messageSid,
      handledAs,
      timestamp: new Date().toISOString(),
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
  const contact = business.owner_phone || business.owner_email || "the business directly";
  return `${business.name}: for help, contact ${contact}. Reply STOP to opt out.`;
}

export async function POST(request: Request) {
  const parsed = await parsePayload(request);

  if (!parsed) {
    return jsonError("Invalid Twilio SMS webhook payload.", 400);
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("x-twilio-signature");

  if (authToken && signature) {
    const valid = validateTwilioSignature({
      authToken,
      url: getValidationUrl(request),
      params: parsed.signatureParams,
      signature,
    });

    if (!valid) return jsonError("Invalid Twilio signature.", 403);
  } else if (shouldRequireSignature()) {
    return jsonError("Twilio signature validation is required.", 403);
  } else if (!signaturesEnabled() && isDevelopment()) {
    console.warn("[twilio.sms] Signature validation skipped because TWILIO_AUTH_TOKEN is missing.");
  }

  const { from, to, body, messageSid } = parsed.payload;

  if (!from || !to || !body) {
    return jsonError("Twilio SMS payload requires From, To, and Body.", 400);
  }

  const handledAs = classifyInboundSms(body);
  const businessMatch = await resolveBusinessByToNumber(to);

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

  const leadMatch = await resolveLeadByFromNumber(businessMatch.business.id, from);

  if (!leadMatch.lead) {
    if (isDevelopment()) {
      console.warn("[twilio.sms] Inbound SMS did not match a lead", {
        businessId: businessMatch.business.id,
        reason: leadMatch.error ?? "No lead phone matched inbound From number.",
        hasMessageSid: Boolean(messageSid),
      });
    }

    return twimlResponse(handledAs === "help" ? getHelpMessage(businessMatch.business) : undefined);
  }

  const alreadyStored = await hasExistingMessage(businessMatch.business.id, messageSid);
  if (alreadyStored) {
    return twimlResponse(handledAs === "help" ? getHelpMessage(businessMatch.business) : undefined);
  }

  const messageError = await logInboundSms({
    businessId: businessMatch.business.id,
    leadId: leadMatch.lead.id,
    body,
    messageSid,
    handledAs,
  });

  if (messageError) {
    return jsonError("Failed to store inbound SMS.", 500);
  }

  const leadUpdateError = await updateLeadForInboundSms({
    businessId: businessMatch.business.id,
    leadId: leadMatch.lead.id,
    handledAs,
  });

  if (leadUpdateError && isDevelopment()) {
    console.warn("[twilio.sms] Failed to update lead after inbound SMS", {
      businessId: businessMatch.business.id,
      leadId: leadMatch.lead.id,
      handledAs,
      error: leadUpdateError.message,
    });
  }

  await logAuditEvent({
    businessId: businessMatch.business.id,
    leadId: leadMatch.lead.id,
    handledAs,
    messageSid,
  });

  if (handledAs === "opt_out") {
    return twimlResponse("You are unsubscribed and will no longer receive SMS messages from this business.");
  }

  if (handledAs === "help") {
    return twimlResponse(getHelpMessage(businessMatch.business));
  }

  return twimlResponse();
}
