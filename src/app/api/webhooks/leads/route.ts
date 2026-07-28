import { NextResponse } from "next/server";

import { sendFirstTouchSms } from "@/lib/automations/first-touch";
import { sendLeadNotificationEmail } from "@/lib/messaging/lead-notifications";
import { sendOwnerLeadAlertSms } from "@/lib/messaging/owner-alerts";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeSharedSecret } from "@/lib/webhooks/secret";
import {
  normalizeLeadPayload,
  normalizePhone,
  type NormalizedLeadPayload,
} from "@/lib/webhooks/lead-payload";
import type { LeadStatus, SmsConsentStatus } from "@/types/database";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 64_000;
const INVALID_PAYLOAD_ERROR =
  "Invalid webhook payload. Send a JSON object with name/contact fields and optional source/message/metadata.";
const MISSING_CONTACT_ERROR = "Lead requires at least a phone number or email.";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-webhook-secret",
};
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEAD_SELECT =
  "id, first_name, last_name, phone, phone_e164, email, company, source, service_interest, status, notes, external_crm_name, external_crm_id, metadata_json, sms_consent_status";
const PROGRESSED_STATUSES = new Set<LeadStatus>([
  "booked",
  "completed",
  "review_requested",
  "lost",
]);

type AdminClient = ReturnType<typeof createAdminClient>;

type BusinessTarget = {
  id: string;
  name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  owner_sms_alerts: boolean | null;
  resend_from_email: string | null;
  twilio_from_number: string | null;
  sms_compliance_status: string | null;
};

type LeadMatch = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  company: string | null;
  source: string | null;
  service_interest: string | null;
  status: LeadStatus;
  notes: string | null;
  external_crm_name: string | null;
  external_crm_id: string | null;
  metadata_json: Record<string, unknown> | null;
  sms_consent_status: SmsConsentStatus | null;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function getExpectedSecret() {
  return process.env.INBOUND_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || null;
}

function authorizeWebhookRequest(request: Request) {
  return authorizeSharedSecret({
    request,
    expectedSecret: getExpectedSecret(),
    headerName: "x-webhook-secret",
    missingConfigurationError: "Inbound lead webhook is not configured.",
    invalidSecretError: "Webhook secret is invalid.",
  });
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

function readPayloadBusinessId(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).business_id;
  return typeof value === "string" ? value.trim() : null;
}

function getConfiguredBusinessId() {
  return (
    process.env.INBOUND_WEBHOOK_BUSINESS_ID ||
    process.env.WEBHOOK_BUSINESS_ID ||
    process.env.BUSINESS_ID ||
    null
  );
}

async function resolveBusinessTarget(
  admin: AdminClient,
  payload: unknown
): Promise<
  | { ok: true; business: BusinessTarget }
  | { ok: false; status: number; error: string }
> {
  const businessId = getConfiguredBusinessId() || readPayloadBusinessId(payload);

  if (businessId) {
    if (!UUID_RE.test(businessId)) {
      return { ok: false, status: 400, error: "Invalid webhook business id." };
    }

    const { data, error } = await admin
      .from("businesses")
      .select("id, name, owner_email, owner_phone, owner_sms_alerts, resend_from_email, twilio_from_number, sms_compliance_status")
      .eq("id", businessId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        status: 500,
        error: isDevelopment()
          ? `Webhook business lookup failed: ${error.message}`
          : "Webhook business lookup failed.",
      };
    }

    if (!data) return { ok: false, status: 404, error: "Webhook business not found." };
    return { ok: true, business: data as BusinessTarget };
  }

  const { data, error } = await admin
    .from("businesses")
    .select("id, name, owner_email, owner_phone, owner_sms_alerts, resend_from_email, twilio_from_number, sms_compliance_status")
    .limit(2);

  if (error) {
    return {
      ok: false,
      status: 500,
      error: isDevelopment()
        ? `Webhook business lookup failed: ${error.message}`
        : "Webhook business lookup failed.",
    };
  }

  if (!data || data.length !== 1) {
    return {
      ok: false,
      status: 503,
      error:
        "Set INBOUND_WEBHOOK_BUSINESS_ID for this deployment before using the generic webhook.",
    };
  }

  return { ok: true, business: data[0] as BusinessTarget };
}

async function logAuditEvent(
  admin: AdminClient,
  params: {
    businessId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await admin.from("audit_logs").insert({
    business_id: params.businessId,
    user_id: null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata_json: params.metadata ?? null,
  });

  if (error && isDevelopment()) {
    console.warn("[webhooks.leads.generic] Audit log failed", {
      businessId: params.businessId,
      action: params.action,
      error: error.message,
    });
  }
}

async function createWebhookEvent(
  admin: AdminClient,
  businessId: string,
  payload: NormalizedLeadPayload,
  errorMessage?: string
) {
  const { data, error } = await admin
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

  if (error) {
    console.warn("[webhooks.leads.generic] Failed to record webhook event", {
      businessId,
      error: error.message,
    });
  }

  return data?.id as string | undefined;
}

async function markWebhookEventProcessed(
  admin: AdminClient,
  eventId: string | undefined,
  errorMessage?: string
) {
  if (!eventId) return;

  const { error } = await admin
    .from("webhook_events")
    .update({
      processed: true,
      error_message: errorMessage ?? null,
    })
    .eq("id", eventId);

  if (error) {
    console.warn("[webhooks.leads.generic] Failed to update webhook event", {
      eventId,
      error: error.message,
    });
  }
}

async function findExistingLead(
  admin: AdminClient,
  businessId: string,
  lead: NormalizedLeadPayload
) {
  if (lead.externalCrmId) {
    const { data, error } = await admin
      .from("leads")
      .select(LEAD_SELECT)
      .eq("business_id", businessId)
      .eq("source", lead.source)
      .eq("external_crm_id", lead.externalCrmId)
      .limit(1)
      .maybeSingle();

    if (error) return { lead: null, error };
    if (data) return { lead: data as LeadMatch, error: null };
  }

  if (lead.externalCrmId) {
    const { data, error } = await admin
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

  if (lead.email) {
    const { data, error } = await admin
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
    const { data, error } = await admin
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

  return { lead: null, error: null };
}

function mergeNotes(existingNotes: string | null, incomingNotes: string | null) {
  if (!incomingNotes) return existingNotes;
  if (!existingNotes) return incomingNotes;
  if (existingNotes.includes(incomingNotes)) return existingNotes;

  return `${existingNotes}\n\nWebhook update:\n${incomingNotes}`.slice(0, 4000);
}

function mergeMetadata(
  existing: Record<string, unknown> | null,
  incoming: Record<string, string>
) {
  return {
    ...(existing ?? {}),
    ...incoming,
  };
}

function buildLeadUpdate(existingLead: LeadMatch, lead: NormalizedLeadPayload) {
  const update: Record<string, unknown> = {
    metadata_json: mergeMetadata(existingLead.metadata_json, lead.metadata),
  };

  if (lead.firstName !== "Unknown" && existingLead.first_name === "Unknown") {
    update.first_name = lead.firstName;
  }

  if (lead.lastName && !existingLead.last_name) update.last_name = lead.lastName;
  if (lead.phone && !existingLead.phone) update.phone = lead.phone;
  if (lead.phoneE164 && !existingLead.phone_e164) update.phone_e164 = lead.phoneE164;
  if (lead.email && !existingLead.email) update.email = lead.email;

  // Consent may only upgrade unknown -> opted_in on duplicates. An existing
  // opted_out is never downgraded by a repeat form submission.
  if (
    lead.smsConsent === "granted" &&
    (existingLead.sms_consent_status ?? "unknown") === "unknown"
  ) {
    update.sms_consent_status = "opted_in";
    update.sms_consent_source = lead.smsConsentSource ?? "web_form";
    update.sms_consent_at = new Date().toISOString();
  }
  if (lead.company && !existingLead.company) update.company = lead.company;
  if (lead.source && !existingLead.source) update.source = lead.source;
  if (lead.serviceInterest && !existingLead.service_interest) {
    update.service_interest = lead.serviceInterest;
    update.intent = lead.serviceInterest;
  }
  if (lead.externalCrmId && !existingLead.external_crm_id) {
    update.external_crm_id = lead.externalCrmId;
    update.sync_status = "synced";
  }
  if (lead.externalCrmName && !existingLead.external_crm_name) {
    update.external_crm_name = lead.externalCrmName;
  }
  if (lead.notes) update.notes = mergeNotes(existingLead.notes, lead.notes);
  if (!PROGRESSED_STATUSES.has(existingLead.status)) update.status = "needs_reply";

  return update;
}

async function createLead(
  admin: AdminClient,
  businessId: string,
  lead: NormalizedLeadPayload
) {
  const { data, error } = await admin
    .from("leads")
    .insert({
      business_id: businessId,
      first_name: lead.firstName,
      last_name: lead.lastName,
      phone: lead.phone,
      phone_e164: lead.phoneE164,
      email: lead.email,
      company: lead.company,
      source: lead.source,
      service_interest: lead.serviceInterest,
      intent: lead.serviceInterest,
      notes: lead.notes,
      status: "new",
      external_crm_name: lead.externalCrmName,
      external_crm_id: lead.externalCrmId,
      metadata_json: lead.metadata,
      sync_status: lead.externalCrmId ? "synced" : "not_connected",
      consent_source: "website_webhook",
      // Explicit consent from the form/ad payload opts the lead in; anything
      // else stays "unknown" and the compliance gate holds SMS (email-only).
      sms_consent_status: lead.smsConsent === "granted" ? "opted_in" : "unknown",
      sms_consent_source: lead.smsConsent === "granted" ? lead.smsConsentSource : null,
      sms_consent_at: lead.smsConsent === "granted" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  return { leadId: data?.id as string | undefined, error };
}

async function updateLead(
  admin: AdminClient,
  existingLead: LeadMatch,
  lead: NormalizedLeadPayload
) {
  const update = buildLeadUpdate(existingLead, lead);

  const { error } = await admin
    .from("leads")
    .update(update)
    .eq("id", existingLead.id);

  return { leadId: existingLead.id, error };
}

async function logInboundMessage(
  admin: AdminClient,
  businessId: string,
  leadId: string,
  body: string | null
) {
  if (!body) return;

  const { error } = await admin.from("messages").insert({
    business_id: businessId,
    lead_id: leadId,
    channel: "manual_note",
    direction: "inbound",
    body,
    status: "received",
    received_at: new Date().toISOString(),
  });

  if (error) {
    console.warn("[webhooks.leads.generic] Failed to log inbound message", {
      businessId,
      leadId,
      error: error.message,
    });
  }
}

function getLeadName(lead: NormalizedLeadPayload) {
  return `${lead.firstName} ${lead.lastName ?? ""}`.trim() || "Unnamed lead";
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const auth = authorizeWebhookRequest(request);

  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, auth.status);
  }

  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("[webhooks.leads.generic] Supabase service configuration missing", {
      error: error instanceof Error ? error.message : "Unknown configuration error",
    });

    return jsonResponse(
      { ok: false, error: "Webhook service is not configured." },
      500
    );
  }

  const rawPayload = await readPayload(request);

  if (!rawPayload) {
    return jsonResponse({ ok: false, error: INVALID_PAYLOAD_ERROR }, 400);
  }

  const businessTarget = await resolveBusinessTarget(admin, rawPayload);

  if (!businessTarget.ok) {
    return jsonResponse({ ok: false, error: businessTarget.error }, businessTarget.status);
  }

  const leadPayload = normalizeLeadPayload(rawPayload);

  if (!leadPayload) {
    await logAuditEvent(admin, {
      businessId: businessTarget.business.id,
      action: "webhook.invalid_payload",
      entityType: "business",
      entityId: businessTarget.business.id,
      metadata: { reason: "unsupported_payload_shape", route: "/api/webhooks/leads" },
    });

    return jsonResponse({ ok: false, error: INVALID_PAYLOAD_ERROR }, 400);
  }

  if (!leadPayload.phone && !leadPayload.email) {
    await createWebhookEvent(
      admin,
      businessTarget.business.id,
      leadPayload,
      MISSING_CONTACT_ERROR
    );
    await logAuditEvent(admin, {
      businessId: businessTarget.business.id,
      action: "webhook.invalid_payload",
      entityType: "business",
      entityId: businessTarget.business.id,
      metadata: { reason: "missing_contact", route: "/api/webhooks/leads" },
    });

    return jsonResponse({ ok: false, error: MISSING_CONTACT_ERROR }, 400);
  }

  const eventId = await createWebhookEvent(
    admin,
    businessTarget.business.id,
    leadPayload
  );
  const { lead: existingLead, error: dedupeError } = await findExistingLead(
    admin,
    businessTarget.business.id,
    leadPayload
  );

  if (dedupeError) {
    await markWebhookEventProcessed(admin, eventId, "Lead lookup failed.");
    return jsonResponse(
      {
        ok: false,
        error: isDevelopment()
          ? `Lead lookup failed: ${dedupeError.message}`
          : "Lead lookup failed.",
      },
      500
    );
  }

  const saveResult = existingLead
    ? await updateLead(admin, existingLead, leadPayload)
    : await createLead(admin, businessTarget.business.id, leadPayload);

  if (saveResult.error || !saveResult.leadId) {
    const errorMessage = existingLead ? "Lead update failed." : "Lead creation failed.";
    await markWebhookEventProcessed(admin, eventId, errorMessage);

    return jsonResponse(
      {
        ok: false,
        error: isDevelopment()
          ? `${errorMessage} ${saveResult.error?.message ?? "No lead id returned."}`
          : errorMessage,
      },
      500
    );
  }

  await logInboundMessage(
    admin,
    businessTarget.business.id,
    saveResult.leadId,
    leadPayload.message
  );
  await markWebhookEventProcessed(admin, eventId);
  await logAuditEvent(admin, {
    businessId: businessTarget.business.id,
    action: existingLead ? "webhook.lead_updated" : "webhook.lead_created",
    entityType: "lead",
    entityId: saveResult.leadId,
    metadata: {
      route: "/api/webhooks/leads",
      source: leadPayload.source,
      externalId: leadPayload.externalCrmId,
      matchedBy: existingLead ? "external_id_email_or_phone" : null,
    },
  });

  if (!existingLead) {
    // T+0 first touch: fire the instant SMS reply through the compliance
    // gate. Wrapped like the Resend call - it must never break lead capture.
    try {
      await sendFirstTouchSms({
        business: businessTarget.business,
        lead: {
          id: saveResult.leadId,
          first_name: leadPayload.firstName,
          phone: leadPayload.phone,
          service_interest: leadPayload.serviceInterest,
        },
      });
    } catch (error) {
      console.warn("[webhooks.leads.generic] First-touch SMS failed", {
        leadId: saveResult.leadId,
        error: error instanceof Error ? error.message : "Unknown first-touch error",
      });
    }

    await sendLeadNotificationEmail({
      businessId: businessTarget.business.id,
      leadId: saveResult.leadId,
      businessName: businessTarget.business.name,
      businessOwnerEmail: businessTarget.business.owner_email,
      businessFromEmail: businessTarget.business.resend_from_email,
      leadName: getLeadName(leadPayload),
      leadEmail: leadPayload.email,
      leadPhone: leadPayload.phone,
      leadCompany: leadPayload.company,
      leadSource: leadPayload.source,
      serviceInterest: leadPayload.serviceInterest,
      message: leadPayload.message,
      createdBy: "webhook",
    });

    // Owner alert alongside the owner email: fire-and-forget, fail-soft.
    try {
      await sendOwnerLeadAlertSms({
        business: {
          id: businessTarget.business.id,
          owner_phone: businessTarget.business.owner_phone ?? null,
          owner_sms_alerts: businessTarget.business.owner_sms_alerts ?? null,
          twilio_from_number: businessTarget.business.twilio_from_number ?? null,
        },
        lead: {
          id: saveResult.leadId,
          name: getLeadName(leadPayload),
          phone: leadPayload.phone,
          serviceInterest: leadPayload.serviceInterest,
        },
      });
    } catch (error) {
      console.warn("[webhooks.leads.generic] Owner alert SMS failed", {
        leadId: saveResult.leadId,
        error: error instanceof Error ? error.message : "Unknown owner-alert error",
      });
    }
  }

  return jsonResponse(
    {
      ok: true,
      lead_id: saveResult.leadId,
      created: !existingLead,
      duplicate: Boolean(existingLead),
    },
    existingLead ? 200 : 201
  );
}
