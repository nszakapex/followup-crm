"use server";

import { revalidatePath } from "next/cache";

import { sendFirstTouchSms } from "@/lib/automations/first-touch";
import { sendLeadNotificationEmail } from "@/lib/messaging/lead-notifications";
import { sendOwnerLeadAlertSms } from "@/lib/messaging/owner-alerts";
import { toE164 } from "@/lib/messaging/sms-compliance-core";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/webhooks/lead-payload";
import type { LeadStatus } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type UserContext = {
  userId: string;
  businessId: string;
  businessName: string | null;
  businessOwnerEmail: string | null;
  businessFromEmail: string | null;
};

type LeadMatch = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  source: string | null;
  service_interest: string | null;
  notes: string | null;
  next_followup_at: string | null;
};

const LEAD_STATUSES = new Set<LeadStatus>([
  "new",
  "contacted",
  "needs_reply",
  "interested",
  "booked",
  "completed",
  "review_requested",
  "lost",
]);

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullable(value: string) {
  return value ? value : null;
}

function normalizeEmail(value: string) {
  return value ? value.toLowerCase() : "";
}

function mergeNotes(existingNotes: string | null, incomingNotes: string | null) {
  if (!incomingNotes) return existingNotes;
  if (!existingNotes) return incomingNotes;
  if (existingNotes.includes(incomingNotes)) return existingNotes;

  return `${existingNotes}\n\nManual update:\n${incomingNotes}`.slice(0, 4000);
}

function parseFollowup(value: string) {
  if (!value) return { value: null as string | null };

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: "Follow-up date must be a valid date and time." };
  }

  return { value: date.toISOString() };
}

function statusIsTerminal(status: LeadStatus) {
  return ["booked", "completed", "review_requested", "lost"].includes(status);
}

async function getUserContext(supabase: SupabaseServerClient): Promise<
  | { ok: true; context: UserContext }
  | { ok: false; error: string }
> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { ok: false, error: "Not authenticated." };

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      ok: false,
      error: "User profile not found: " + (profileError?.message ?? "missing row"),
    };
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id, name, owner_email, resend_from_email")
    .eq("id", profile.business_id)
    .single();

  if (businessError || !business) {
    return {
      ok: false,
      error: "Business profile not found: " + (businessError?.message ?? "missing row"),
    };
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      businessId: business.id,
      businessName: business.name ?? null,
      businessOwnerEmail: business.owner_email ?? null,
      businessFromEmail: business.resend_from_email ?? null,
    },
  };
}

async function logAuditEvent(
  supabase: SupabaseServerClient,
  context: UserContext,
  params: {
    action: string;
    leadId: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("audit_logs").insert({
    business_id: context.businessId,
    user_id: context.userId,
    action: params.action,
    entity_type: "lead",
    entity_id: params.leadId,
    metadata_json: params.metadata ?? null,
  });

  if (error && process.env.NODE_ENV !== "production") {
    console.warn("[lead-actions] Audit log failed", {
      action: params.action,
      leadId: params.leadId,
      error: error.message,
    });
  }
}

async function findExistingLead(
  supabase: SupabaseServerClient,
  businessId: string,
  params: { email: string; phone: string }
) {
  const select =
    "id, first_name, last_name, phone, email, company, source, service_interest, notes, next_followup_at";

  if (params.email) {
    const { data, error } = await supabase
      .from("leads")
      .select(select)
      .eq("business_id", businessId)
      .ilike("email", params.email)
      .limit(1)
      .maybeSingle();

    if (error) return { lead: null, error };
    if (data) return { lead: data as LeadMatch, error: null };
  }

  const normalizedPhone = normalizePhone(params.phone);
  if (!normalizedPhone) return { lead: null, error: null };

  const { data, error } = await supabase
    .from("leads")
    .select(select)
    .eq("business_id", businessId)
    .not("phone", "is", null);

  if (error) return { lead: null, error };

  const match = ((data ?? []) as LeadMatch[]).find(
    (candidate) => normalizePhone(candidate.phone) === normalizedPhone
  );

  return { lead: match ?? null, error: null };
}

export async function createLead(formData: FormData) {
  const supabase = await createClient();
  const contextResult = await getUserContext(supabase);
  if (!contextResult.ok) return { error: contextResult.error };

  const context = contextResult.context;
  const firstName = readString(formData, "first_name");
  const lastName = readString(formData, "last_name");
  const company = readString(formData, "company");
  const phone = readString(formData, "phone");
  const email = normalizeEmail(readString(formData, "email"));
  const source = readString(formData, "source") || "manual";
  const serviceInterest = readString(formData, "service_interest");
  const notes = readString(formData, "notes");
  const followup = parseFollowup(readString(formData, "next_followup_at"));
  // Verbal opt-in must be verifiable for A2P audits: the toggle is explicit,
  // and the note below records how consent was obtained.
  const smsConsentGranted = readString(formData, "sms_consent") === "granted";

  if (!firstName) return { error: "First name is required." };
  if (!phone && !email) return { error: "A phone number or email is required." };
  if (followup.error) return { error: followup.error };

  const existing = await findExistingLead(supabase, context.businessId, { email, phone });

  if (existing.error) {
    return { error: "Failed to check for duplicate lead: " + existing.error.message };
  }

  if (existing.lead) {
    const update: Record<string, unknown> = {
      first_name: existing.lead.first_name === "Unknown" ? firstName : existing.lead.first_name,
      last_name: existing.lead.last_name || nullable(lastName),
      phone: existing.lead.phone || nullable(phone),
      email: existing.lead.email || nullable(email),
      company: existing.lead.company || nullable(company),
      source: existing.lead.source || source,
      service_interest: existing.lead.service_interest || nullable(serviceInterest),
      notes: mergeNotes(existing.lead.notes, nullable(notes)),
      next_followup_at: followup.value ?? existing.lead.next_followup_at,
    };

    const { error } = await supabase
      .from("leads")
      .update(update)
      .eq("business_id", context.businessId)
      .eq("id", existing.lead.id);

    if (error) return { error: "Failed to update matching lead: " + error.message };

    await logAuditEvent(supabase, context, {
      action: "lead.duplicate_updated",
      leadId: existing.lead.id,
      metadata: { source: "manual", matchedBy: email ? "email" : "phone" },
    });

    revalidatePath("/leads");
    revalidatePath(`/leads/${existing.lead.id}`);
    revalidatePath("/dashboard");
    return { id: existing.lead.id, duplicate: true };
  }

  const consentNote = smsConsentGranted
    ? "SMS consent obtained verbally at lead creation."
    : null;

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      business_id: context.businessId,
      first_name: firstName,
      last_name: nullable(lastName),
      phone: nullable(phone),
      phone_e164: toE164(phone),
      email: nullable(email),
      company: nullable(company),
      source,
      service_interest: nullable(serviceInterest),
      notes: mergeNotes(nullable(notes), consentNote),
      next_followup_at: followup.value,
      metadata_json: {},
      status: "new",
      consent_source: "manual",
      sms_consent_status: smsConsentGranted ? "opted_in" : "unknown",
      sms_consent_source: smsConsentGranted ? "verbal" : null,
      sms_consent_at: smsConsentGranted ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !lead) {
    return { error: "Failed to create lead: " + (error?.message ?? "missing lead id") };
  }

  await logAuditEvent(supabase, context, {
    action: "lead.created",
    leadId: lead.id,
    metadata: { source: "manual", smsConsentGranted },
  });

  // T+0 first touch through the compliance gate; never blocks lead creation.
  try {
    const { data: businessRow } = await supabase
      .from("businesses")
      .select("id, name, owner_phone, owner_sms_alerts, twilio_from_number, sms_compliance_status")
      .eq("id", context.businessId)
      .maybeSingle();

    if (businessRow) {
      await sendFirstTouchSms({
        business: businessRow,
        lead: {
          id: lead.id,
          first_name: firstName,
          phone: nullable(phone),
          service_interest: nullable(serviceInterest),
        },
      });

      // Owner alert alongside the owner email: fire-and-forget, fail-soft.
      try {
        await sendOwnerLeadAlertSms({
          business: {
            id: businessRow.id,
            owner_phone: businessRow.owner_phone ?? null,
            owner_sms_alerts: businessRow.owner_sms_alerts ?? null,
            twilio_from_number: businessRow.twilio_from_number ?? null,
          },
          lead: {
            id: lead.id,
            name: `${firstName} ${lastName}`.trim(),
            phone: nullable(phone),
            serviceInterest: nullable(serviceInterest),
          },
        });
      } catch (error) {
        console.warn("[lead-actions] Owner alert SMS failed", {
          leadId: lead.id,
          error: error instanceof Error ? error.message : "Unknown owner-alert error",
        });
      }
    }
  } catch (error) {
    console.warn("[lead-actions] First-touch SMS failed", {
      leadId: lead.id,
      error: error instanceof Error ? error.message : "Unknown first-touch error",
    });
  }

  await sendLeadNotificationEmail({
    businessId: context.businessId,
    leadId: lead.id,
    businessName: context.businessName,
    businessOwnerEmail: context.businessOwnerEmail,
    businessFromEmail: context.businessFromEmail,
    leadName: `${firstName} ${lastName}`.trim(),
    leadEmail: email || null,
    leadPhone: phone || null,
    leadCompany: company || null,
    leadSource: source,
    serviceInterest: serviceInterest || null,
    message: notes || null,
    createdBy: "manual",
  });

  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { id: lead.id, duplicate: false };
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const supabase = await createClient();
  const contextResult = await getUserContext(supabase);
  if (!contextResult.ok) return { error: contextResult.error };
  if (!LEAD_STATUSES.has(status)) return { error: "Invalid lead status." };

  const context = contextResult.context;
  const { data: currentLead, error: lookupError } = await supabase
    .from("leads")
    .select("id, status")
    .eq("business_id", context.businessId)
    .eq("id", leadId)
    .maybeSingle();

  if (lookupError) return { error: "Failed to load lead: " + lookupError.message };
  if (!currentLead) return { error: "Lead not found." };

  const updateData: Record<string, unknown> = { status };

  if (status === "contacted") {
    updateData.last_contacted_at = new Date().toISOString();
  }

  if (statusIsTerminal(status)) {
    updateData.next_followup_at = null;
  }

  const { error } = await supabase
    .from("leads")
    .update(updateData)
    .eq("business_id", context.businessId)
    .eq("id", leadId);

  if (error) return { error: "Failed to update lead: " + error.message };

  await logAuditEvent(supabase, context, {
    action: "lead.status_changed",
    leadId,
    metadata: { from: currentLead.status, to: status },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateLead(leadId: string, formData: FormData) {
  const supabase = await createClient();
  const contextResult = await getUserContext(supabase);
  if (!contextResult.ok) return { error: contextResult.error };

  const context = contextResult.context;
  const firstName = readString(formData, "first_name");
  const lastName = readString(formData, "last_name");
  const company = readString(formData, "company");
  const phone = readString(formData, "phone");
  const email = normalizeEmail(readString(formData, "email"));
  const source = readString(formData, "source");
  const serviceInterest = readString(formData, "service_interest");
  const notes = readString(formData, "notes");
  const followup = parseFollowup(readString(formData, "next_followup_at"));

  if (!firstName) return { error: "First name is required." };
  if (!phone && !email) return { error: "A phone number or email is required." };
  if (followup.error) return { error: followup.error };

  const { error } = await supabase
    .from("leads")
    .update({
      first_name: firstName,
      last_name: nullable(lastName),
      phone: nullable(phone),
      phone_e164: toE164(phone),
      email: nullable(email),
      company: nullable(company),
      source: nullable(source),
      service_interest: nullable(serviceInterest),
      notes: nullable(notes),
      next_followup_at: followup.value,
    })
    .eq("business_id", context.businessId)
    .eq("id", leadId);

  if (error) return { error: "Failed to update lead: " + error.message };

  await logAuditEvent(supabase, context, {
    action: "lead.updated",
    leadId,
    metadata: { source: "manual" },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function addLeadNote(leadId: string, note: string) {
  const supabase = await createClient();
  const contextResult = await getUserContext(supabase);
  if (!contextResult.ok) return { error: contextResult.error };

  const context = contextResult.context;
  const body = note.trim();
  if (!body) return { error: "Note is required." };

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("business_id", context.businessId)
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) return { error: "Failed to load lead: " + leadError.message };
  if (!lead) return { error: "Lead not found." };

  const { error } = await supabase.from("messages").insert({
    business_id: context.businessId,
    lead_id: leadId,
    channel: "manual_note",
    direction: "internal",
    body,
    status: "delivered",
  });

  if (error) return { error: "Failed to add note: " + error.message };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  return { success: true };
}
