import { timingSafeEqual } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { sendFirstTouchSms } from "@/lib/automations/first-touch";
import { sendOwnerLeadAlertSms } from "@/lib/messaging/owner-alerts";
import {
  normalizeLeadPayload,
  normalizePhone,
  type NormalizedLeadPayload,
} from "@/lib/webhooks/lead-payload";
import type { LeadStatus, SmsConsentStatus } from "@/types/database";

const MAX_PAYLOAD_BYTES = 64_000;
const INVALID_PAYLOAD_ERROR =
  "Invalid webhook payload. Send a JSON object with a name, phone or email, and optional source/message fields.";
const MISSING_CONTACT_ERROR = "Lead requires at least a phone number or email.";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const LEAD_SELECT =
  "id, first_name, last_name, phone, phone_e164, email, source, status, notes, external_crm_name, external_crm_id, sms_consent_status";
const PROGRESSED_STATUSES = new Set<LeadStatus>([
  "booked",
  "completed",
  "review_requested",
  "lost",
]);

type ServiceClient = ReturnType<typeof createServiceClient>;
type LeadMatch = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  external_crm_name: string | null;
  external_crm_id: string | null;
  sms_consent_status: SmsConsentStatus | null;
};

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function getDatabaseError(action: string, message: string) {
  return isDevelopment() ? `${action}: ${message}` : action;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function safeCompareSecret(incoming: string, stored: string) {
  const incomingBuffer = Buffer.from(incoming);
  const storedBuffer = Buffer.from(stored);

  if (incomingBuffer.length !== storedBuffer.length) return false;

  return timingSafeEqual(incomingBuffer, storedBuffer);
}

async function readPayload(request: Request) {
  const text = await request.text();

  if (!text || text.length > MAX_PAYLOAD_BYTES) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function logAuditEvent(
  supabase: ServiceClient,
  params: {
    businessId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("audit_logs").insert({
    business_id: params.businessId,
    user_id: null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata_json: params.metadata ?? null,
  });

  if (error && isDevelopment()) {
    console.warn("[webhooks.leads] Audit log failed", {
      businessId: params.businessId,
      action: params.action,
      error: error.message,
    });
  }
}

async function createWebhookEvent(
  supabase: ServiceClient,
  businessId: string,
  payload: NormalizedLeadPayload,
  errorMessage?: string
) {
  const { data, error } = await supabase
    .from("webhook_events")
    .insert({
      business_id: businessId,
      source: payload.source,
      payload_json: payload.eventPayload,
      processed: Boolean(errorMessage),
      error_message: errorMessage ?? null,
    })
    .select("id")
    .single();

  return { eventId: data?.id as string | undefined, error };
}

async function markWebhookEventProcessed(
  supabase: ServiceClient,
  eventId: string,
  errorMessage?: string
) {
  const { error } = await supabase
    .from("webhook_events")
    .update({
      processed: true,
      error_message: errorMessage ?? null,
    })
    .eq("id", eventId);

  return error;
}

async function findExistingLead(
  supabase: ServiceClient,
  businessId: string,
  lead: NormalizedLeadPayload
) {
  if (lead.email) {
    const { data, error } = await supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("business_id", businessId)
      .ilike("email", lead.email)
      .limit(1)
      .maybeSingle();

    if (error) return { lead: null, error };
    if (data) return { lead: data as LeadMatch, error: null };
  }

  if (lead.phone) {
    const { data, error } = await supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("business_id", businessId)
      .not("phone", "is", null);

    if (error) return { lead: null, error };

    const match = ((data ?? []) as LeadMatch[]).find(
      (candidate) => normalizePhone(candidate.phone) === lead.phone
    );

    if (match) return { lead: match, error: null };
  }

  if (lead.externalCrmId) {
    const { data, error } = await supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("business_id", businessId)
      .eq("external_crm_name", lead.externalCrmName)
      .eq("external_crm_id", lead.externalCrmId)
      .limit(1)
      .maybeSingle();

    if (error) return { lead: null, error };
    if (data) return { lead: data as LeadMatch, error: null };
  }

  return { lead: null, error: null };
}

function buildLeadUpdate(existingLead: LeadMatch, lead: NormalizedLeadPayload) {
  const update: Record<string, unknown> = {};

  if (lead.firstName !== "Unknown" && existingLead.first_name === "Unknown") {
    update.first_name = lead.firstName;
  }

  if (lead.lastName && !existingLead.last_name) update.last_name = lead.lastName;
  if (lead.phone && !existingLead.phone) update.phone = lead.phone;
  if (lead.phoneE164 && !existingLead.phone_e164) update.phone_e164 = lead.phoneE164;
  if (lead.email && !existingLead.email) update.email = lead.email;

  // Consent may only upgrade unknown -> opted_in; opted_out is never
  // downgraded by a repeat submission.
  if (
    lead.smsConsent === "granted" &&
    (existingLead.sms_consent_status ?? "unknown") === "unknown"
  ) {
    update.sms_consent_status = "opted_in";
    update.sms_consent_source = lead.smsConsentSource ?? "web_form";
    update.sms_consent_at = new Date().toISOString();
  }
  if (lead.source && !existingLead.source) update.source = lead.source;
  if (lead.externalCrmId && !existingLead.external_crm_id) {
    update.external_crm_id = lead.externalCrmId;
    update.sync_status = "synced";
  }
  if (lead.externalCrmName && !existingLead.external_crm_name) {
    update.external_crm_name = lead.externalCrmName;
  }
  if (lead.notes) {
    update.notes = mergeNotes(existingLead.notes, lead.notes);
  }
  if (!PROGRESSED_STATUSES.has(existingLead.status)) {
    update.status = "needs_reply";
  }

  return update;
}

function mergeNotes(existingNotes: string | null, incomingNotes: string) {
  if (!existingNotes) return incomingNotes;
  if (existingNotes.includes(incomingNotes)) return existingNotes;

  const merged = `${existingNotes}\n\nWebhook update:\n${incomingNotes}`;
  return merged.length > 4000 ? merged.slice(0, 4000) : merged;
}

async function createLead(
  supabase: ServiceClient,
  businessId: string,
  lead: NormalizedLeadPayload
) {
  const { data, error } = await supabase
    .from("leads")
    .insert({
      business_id: businessId,
      first_name: lead.firstName,
      last_name: lead.lastName,
      phone: lead.phone,
      phone_e164: lead.phoneE164,
      email: lead.email,
      source: lead.source,
      notes: lead.notes,
      status: "new",
      external_crm_name: lead.externalCrmName,
      external_crm_id: lead.externalCrmId,
      sync_status: lead.externalCrmId ? "synced" : "not_connected",
      consent_source: "website_webhook",
      sms_consent_status: lead.smsConsent === "granted" ? "opted_in" : "unknown",
      sms_consent_source: lead.smsConsent === "granted" ? lead.smsConsentSource : null,
      sms_consent_at: lead.smsConsent === "granted" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  return { leadId: data?.id as string | undefined, error };
}

async function updateLead(
  supabase: ServiceClient,
  existingLead: LeadMatch,
  lead: NormalizedLeadPayload
) {
  const update = buildLeadUpdate(existingLead, lead);

  if (Object.keys(update).length === 0) {
    return { leadId: existingLead.id, error: null };
  }

  const { error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", existingLead.id);

  return { leadId: existingLead.id, error };
}

async function logInboundMessage(
  supabase: ServiceClient,
  businessId: string,
  leadId: string,
  body: string | null
) {
  if (!body) return null;

  const { error } = await supabase.from("messages").insert({
    business_id: businessId,
    lead_id: leadId,
    channel: "manual_note",
    direction: "inbound",
    body,
    status: "received",
    received_at: new Date().toISOString(),
  });

  return error;
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  request: Request,
  props: { params: Promise<{ businessId: string; secret: string }> }
) {
  const { businessId, secret } = await props.params;

  if (!isUuid(businessId)) {
    return jsonResponse(
      { success: false, error: "Invalid business id." },
      400
    );
  }

  let supabase: ServiceClient;

  try {
    supabase = createServiceClient();
  } catch (error) {
    console.error("[webhooks.leads] Supabase service configuration missing", {
      message: error instanceof Error ? error.message : "Unknown configuration error",
    });

    return jsonResponse(
      { success: false, error: "Webhook service is not configured." },
      500
    );
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select(
      "id, webhook_secret, name, owner_phone, owner_sms_alerts, twilio_from_number, sms_compliance_status"
    )
    .eq("id", businessId)
    .maybeSingle();

  if (businessError) {
    console.error("[webhooks.leads] Business lookup failed", {
      businessId,
      error: businessError.message,
    });

    return jsonResponse(
      {
        success: false,
        error: getDatabaseError("Webhook business lookup failed", businessError.message),
      },
      500
    );
  }

  if (!business) {
    return jsonResponse(
      { success: false, error: "Business not found." },
      404
    );
  }

  if (!business.webhook_secret) {
    return jsonResponse(
      { success: false, error: "Lead capture is not configured for this business." },
      403
    );
  }

  if (!secret || !safeCompareSecret(secret, business.webhook_secret)) {
    await logAuditEvent(supabase, {
      businessId,
      action: "webhook.invalid_secret",
      entityType: "business",
      entityId: businessId,
      metadata: { route: "lead_capture" },
    });

    return jsonResponse(
      { success: false, error: "Webhook secret is invalid." },
      401
    );
  }

  const rawPayload = await readPayload(request);

  if (!rawPayload) {
    await logAuditEvent(supabase, {
      businessId,
      action: "webhook.invalid_payload",
      entityType: "business",
      entityId: businessId,
      metadata: { reason: "invalid_json" },
    });

    return jsonResponse(
      { success: false, error: INVALID_PAYLOAD_ERROR },
      400
    );
  }

  const leadPayload = normalizeLeadPayload(rawPayload);

  if (!leadPayload) {
    await logAuditEvent(supabase, {
      businessId,
      action: "webhook.invalid_payload",
      entityType: "business",
      entityId: businessId,
      metadata: { reason: "unsupported_payload_shape" },
    });

    return jsonResponse(
      { success: false, error: INVALID_PAYLOAD_ERROR },
      400
    );
  }

  if (!leadPayload.phone && !leadPayload.email) {
    const { error: eventError } = await createWebhookEvent(
      supabase,
      businessId,
      leadPayload,
      MISSING_CONTACT_ERROR
    );

    if (eventError) {
      console.error("[webhooks.leads] Failed to record invalid payload", {
        businessId,
        error: eventError.message,
      });
    }

    await logAuditEvent(supabase, {
      businessId,
      action: "webhook.invalid_payload",
      entityType: "business",
      entityId: businessId,
      metadata: { reason: "missing_contact" },
    });

    return jsonResponse(
      { success: false, error: MISSING_CONTACT_ERROR },
      400
    );
  }

  const { eventId, error: eventError } = await createWebhookEvent(
    supabase,
    businessId,
    leadPayload
  );

  if (eventError || !eventId) {
    console.error("[webhooks.leads] Failed to record webhook event", {
      businessId,
      error: eventError?.message ?? "No webhook event id returned",
    });

    return jsonResponse(
      {
        success: false,
        error: getDatabaseError(
          "Webhook event could not be recorded",
          eventError?.message ?? "No webhook event id returned"
        ),
      },
      500
    );
  }

  const { lead: existingLead, error: dedupeError } = await findExistingLead(
    supabase,
    businessId,
    leadPayload
  );

  if (dedupeError) {
    await markWebhookEventProcessed(
      supabase,
      eventId,
      "Lead lookup failed during duplicate prevention."
    );

    return jsonResponse(
      {
        success: false,
        error: getDatabaseError("Lead lookup failed", dedupeError.message),
      },
      500
    );
  }

  const saveResult = existingLead
    ? await updateLead(supabase, existingLead, leadPayload)
    : await createLead(supabase, businessId, leadPayload);

  if (saveResult.error || !saveResult.leadId) {
    await markWebhookEventProcessed(
      supabase,
      eventId,
      existingLead ? "Lead update failed." : "Lead creation failed."
    );

    return jsonResponse(
      {
        success: false,
        error: getDatabaseError(
          existingLead ? "Lead could not be updated" : "Lead could not be created",
          saveResult.error?.message ?? "No lead id returned"
        ),
      },
      500
    );
  }

  const messageError = await logInboundMessage(
    supabase,
    businessId,
    saveResult.leadId,
    leadPayload.message
  );

  if (messageError) {
    console.error("[webhooks.leads] Failed to log inbound message", {
      businessId,
      leadId: saveResult.leadId,
      error: messageError.message,
    });
  }

  const processedError = await markWebhookEventProcessed(supabase, eventId);

  if (processedError) {
    console.error("[webhooks.leads] Failed to mark webhook event processed", {
      businessId,
      eventId,
      error: processedError.message,
    });
  }

  await logAuditEvent(supabase, {
    businessId,
    action: existingLead ? "webhook.lead_updated" : "webhook.lead_created",
    entityType: "lead",
    entityId: saveResult.leadId,
    metadata: {
      ingestionMode: "pilot_webhook",
      source: leadPayload.source,
      matchedBy: existingLead ? "email_phone_or_external_id" : null,
    },
  });

  if (!existingLead) {
    // T+0 first touch through the compliance gate; must never break capture.
    try {
      await sendFirstTouchSms({
        business: {
          id: businessId,
          name: (business as { name?: string | null }).name ?? null,
          owner_phone: (business as { owner_phone?: string | null }).owner_phone ?? null,
          twilio_from_number:
            (business as { twilio_from_number?: string | null }).twilio_from_number ?? null,
          sms_compliance_status:
            (business as { sms_compliance_status?: string | null }).sms_compliance_status ??
            null,
        },
        lead: {
          id: saveResult.leadId,
          first_name: leadPayload.firstName,
          phone: leadPayload.phone,
          service_interest: leadPayload.serviceInterest,
        },
      });
    } catch (error) {
      console.warn("[webhooks.leads] First-touch SMS failed", {
        leadId: saveResult.leadId,
        error: error instanceof Error ? error.message : "Unknown first-touch error",
      });
    }

    // Owner alert alongside the owner email: fire-and-forget, fail-soft.
    try {
      await sendOwnerLeadAlertSms({
        business: {
          id: businessId,
          owner_phone: (business as { owner_phone?: string | null }).owner_phone ?? null,
          owner_sms_alerts:
            (business as { owner_sms_alerts?: boolean | null }).owner_sms_alerts ?? null,
          twilio_from_number:
            (business as { twilio_from_number?: string | null }).twilio_from_number ?? null,
        },
        lead: {
          id: saveResult.leadId,
          name: [leadPayload.firstName, leadPayload.lastName].filter(Boolean).join(" ").trim(),
          phone: leadPayload.phone,
          serviceInterest: leadPayload.serviceInterest,
        },
      });
    } catch (error) {
      console.warn("[webhooks.leads] Owner alert SMS failed", {
        leadId: saveResult.leadId,
        error: error instanceof Error ? error.message : "Unknown owner-alert error",
      });
    }
  }

  return jsonResponse(
    {
      success: true,
      leadId: saveResult.leadId,
      created: !existingLead,
      updated: Boolean(existingLead),
    },
    existingLead ? 200 : 201
  );
}
