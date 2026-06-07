import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type LeadNotificationInput = {
  businessId: string;
  leadId: string;
  businessName: string | null;
  businessOwnerEmail: string | null;
  businessFromEmail?: string | null;
  leadName: string;
  leadEmail: string | null;
  leadPhone: string | null;
  leadCompany?: string | null;
  leadSource: string | null;
  serviceInterest?: string | null;
  message?: string | null;
  createdBy: "manual" | "webhook";
};

type ResendResponse = {
  id?: string;
  message?: string;
};

function getConfiguredAppUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/$/, "");
}

function getNotificationRecipient(ownerEmail: string | null) {
  return (
    process.env.OWNER_NOTIFY_EMAIL ||
    process.env.NOTIFICATION_EMAIL ||
    ownerEmail ||
    null
  );
}

function getFromEmail(businessFromEmail?: string | null) {
  return businessFromEmail || process.env.RESEND_FROM_EMAIL || null;
}

function isConfigured(params: { to: string | null; from: string | null }) {
  return Boolean(process.env.RESEND_API_KEY && params.from && params.to);
}

function buildSubject(input: LeadNotificationInput) {
  const source = input.leadSource ? ` from ${input.leadSource}` : "";
  const business = input.businessName ? ` - ${input.businessName}` : "";
  return `New lead${source}: ${input.leadName}${business}`;
}

function buildBody(input: LeadNotificationInput) {
  const appUrl = getConfiguredAppUrl();
  const leadUrl = appUrl ? `${appUrl}/leads/${input.leadId}` : null;
  const lines = [
    `A new lead was created by ${input.createdBy === "webhook" ? "webhook intake" : "manual entry"}.`,
    "",
    `Name: ${input.leadName}`,
    `Email: ${input.leadEmail || "Not provided"}`,
    `Phone: ${input.leadPhone || "Not provided"}`,
    input.leadCompany ? `Company: ${input.leadCompany}` : null,
    input.serviceInterest ? `Interest: ${input.serviceInterest}` : null,
    `Source: ${input.leadSource || "Not provided"}`,
    input.message ? "" : null,
    input.message ? `Message: ${input.message}` : null,
    leadUrl ? "" : null,
    leadUrl ? `Open lead: ${leadUrl}` : null,
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}

async function logNotificationMessage({
  input,
  body,
  status,
  providerMessageId = null,
  errorMessage = null,
}: {
  input: LeadNotificationInput;
  body: string;
  status: "sent" | "failed";
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("messages").insert({
      business_id: input.businessId,
      lead_id: input.leadId,
      channel: "email",
      direction: "internal",
      body,
      status,
      provider: "resend",
      provider_message_id: providerMessageId,
      error_message: errorMessage,
      sent_at: new Date().toISOString(),
    });

    if (error) {
      console.warn("[lead-notifications] Failed to log notification email", {
        businessId: input.businessId,
        leadId: input.leadId,
        error: error.message,
      });
    }
  } catch (error) {
    console.warn("[lead-notifications] Notification logging unavailable", {
      businessId: input.businessId,
      leadId: input.leadId,
      error: error instanceof Error ? error.message : "Unknown logging error",
    });
  }
}

export async function sendLeadNotificationEmail(input: LeadNotificationInput) {
  const to = getNotificationRecipient(input.businessOwnerEmail);
  const from = getFromEmail(input.businessFromEmail);
  const subject = buildSubject(input);
  const body = buildBody(input);
  const storedBody = `Subject: ${subject}\n\n${body}`;

  if (!isConfigured({ to, from })) {
    const errorMessage = "Lead notification email is not configured.";
    await logNotificationMessage({
      input,
      body: storedBody,
      status: "failed",
      errorMessage,
    });

    console.warn("[lead-notifications] Resend notification skipped", {
      businessId: input.businessId,
      leadId: input.leadId,
      hasApiKey: Boolean(process.env.RESEND_API_KEY),
      hasFrom: Boolean(from),
      hasRecipient: Boolean(to),
    });

    return { success: false, skipped: true, error: errorMessage };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text: body,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as ResendResponse;

    if (!response.ok) {
      const errorMessage = result.message || `Resend returned HTTP ${response.status}.`;
      await logNotificationMessage({
        input,
        body: storedBody,
        status: "failed",
        errorMessage: "Lead notification email failed.",
      });

      console.error("[lead-notifications] Resend notification failed", {
        businessId: input.businessId,
        leadId: input.leadId,
        status: response.status,
        detail: errorMessage,
      });

      return { success: false, skipped: false, error: errorMessage };
    }

    await logNotificationMessage({
      input,
      body: storedBody,
      status: "sent",
      providerMessageId: result.id ?? null,
    });

    return { success: true, skipped: false, providerMessageId: result.id ?? null };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Resend notification error.";
    await logNotificationMessage({
      input,
      body: storedBody,
      status: "failed",
      errorMessage: "Lead notification email failed.",
    });

    console.error("[lead-notifications] Resend notification exception", {
      businessId: input.businessId,
      leadId: input.leadId,
      error: errorMessage,
    });

    return { success: false, skipped: false, error: errorMessage };
  }
}
