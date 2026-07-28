// Owner SMS alert on lead capture. Operational traffic to the business owner
// (who configured their own number), so the A2P lead-consent gate and quiet
// hours deliberately do not apply - the gate is SMS_ENABLED + provider
// configured only. Kept free of "server-only" so tests can inject the client
// and provider (same pattern as twilio-webhooks.ts).

import {
  applyProviderOutcomeToOutboundSms,
  insertPendingOutboundSms,
  type ProviderSendOutcome,
} from "@/lib/messaging/outbound-log";
import {
  getSmsProviderReadiness,
  isSmsEnabled,
  shouldSkipReviewDelivery,
} from "@/lib/messaging/provider-config";
import { toE164 } from "@/lib/messaging/sms-compliance-core";
import type { SmsProviderName } from "@/lib/sms/types";

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
};

export type OwnerAlertBusiness = {
  id: string;
  owner_phone: string | null;
  owner_sms_alerts: boolean | null;
  twilio_from_number?: string | null;
};

export type OwnerAlertLead = {
  id: string;
  name: string | null;
  phone: string | null;
  serviceInterest: string | null;
};

export type OwnerAlertDeps = {
  client?: DbClient;
  sendViaProvider?: (input: {
    businessId: string;
    leadId: string;
    to: string;
    body: string;
  }) => Promise<ProviderSendOutcome>;
};

export type OwnerAlertResult = {
  attempted: boolean;
  sent: boolean;
  reason: string | null;
};

function getConfiguredAppUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/$/, "");
}

/**
 * "New lead: {name} — {service} — {phone}. Reply from the dashboard: {link}"
 * with missing pieces dropped rather than rendered as blanks.
 */
export function buildOwnerLeadAlertBody({
  leadName,
  serviceInterest,
  leadPhone,
  leadUrl,
}: {
  leadName: string | null;
  serviceInterest: string | null;
  leadPhone: string | null;
  leadUrl: string | null;
}) {
  const parts = [leadName?.trim() || "Unknown", serviceInterest?.trim(), leadPhone?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(" — ");

  const link = leadUrl ? ` Reply from the dashboard: ${leadUrl}` : "";
  return `New lead: ${parts}.${link}`;
}

/**
 * Fire-and-forget owner alert, same fail-soft rule as the owner email: it
 * never throws and a failure must never break lead capture. Fires regardless
 * of the lead's own consent status - the recipient is the owner, not the lead.
 */
export async function sendOwnerLeadAlertSms({
  business,
  lead,
  deps,
}: {
  business: OwnerAlertBusiness;
  lead: OwnerAlertLead;
  deps?: OwnerAlertDeps;
}): Promise<OwnerAlertResult> {
  try {
    if (!business.owner_sms_alerts) {
      return { attempted: false, sent: false, reason: "alerts_disabled" };
    }

    const ownerPhone = toE164(business.owner_phone);
    if (!ownerPhone) {
      return { attempted: false, sent: false, reason: "no_owner_phone" };
    }

    if (!isSmsEnabled()) {
      return { attempted: false, sent: false, reason: "sms_disabled" };
    }

    const readiness = getSmsProviderReadiness(business.twilio_from_number ?? null);
    if (!readiness.configured) {
      return { attempted: false, sent: false, reason: "provider_not_configured" };
    }

    const appUrl = getConfiguredAppUrl();
    const body = buildOwnerLeadAlertBody({
      leadName: lead.name,
      serviceInterest: lead.serviceInterest,
      leadPhone: lead.phone,
      leadUrl: appUrl ? `${appUrl}/leads/${lead.id}` : null,
    });

    const client = deps?.client ?? (await getAdminClient());
    const skipDelivery = shouldSkipReviewDelivery();
    const provider = skipDelivery ? "test_mode" : readiness.provider;

    const pendingRow = await insertPendingOutboundSms(client, {
      businessId: business.id,
      leadId: lead.id,
      body,
      provider,
      kind: "owner_alert",
    });

    if (!pendingRow.id) {
      console.warn("[owner-alerts] Failed to log owner alert", {
        businessId: business.id,
        leadId: lead.id,
        error: pendingRow.error,
      });

      return { attempted: true, sent: false, reason: "log_failed" };
    }

    if (skipDelivery) {
      return { attempted: true, sent: false, reason: "delivery_skipped" };
    }

    const sendViaProvider = deps?.sendViaProvider ?? (await getDefaultProviderSend(readiness.provider));
    const outcome = await sendViaProvider({
      businessId: business.id,
      leadId: lead.id,
      to: ownerPhone,
      body,
    });

    const applied = await applyProviderOutcomeToOutboundSms(client, pendingRow.id, outcome);

    if (applied.error) {
      console.warn("[owner-alerts] Failed to apply provider outcome", {
        businessId: business.id,
        leadId: lead.id,
        error: applied.error,
      });
    }

    if (outcome.status === "failed") {
      console.warn("[owner-alerts] Owner alert delivery failed", {
        businessId: business.id,
        leadId: lead.id,
        errorCode: outcome.providerErrorCode ?? null,
      });

      return { attempted: true, sent: false, reason: "delivery_failed" };
    }

    return { attempted: true, sent: true, reason: null };
  } catch (error) {
    console.warn("[owner-alerts] Owner alert attempt failed", {
      businessId: business.id,
      leadId: lead.id,
      error: error instanceof Error ? error.message : "Unknown owner-alert error",
    });

    return { attempted: true, sent: false, reason: "owner_alert_exception" };
  }
}

async function getAdminClient(): Promise<DbClient> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return createAdminClient();
}

async function getDefaultProviderSend(providerName: SmsProviderName) {
  const { sendSms } = await import("@/lib/sms");

  return async (input: { businessId: string; leadId: string; to: string; body: string }) => {
    const result = await sendSms(input, { providerName });

    return {
      status: result.status,
      providerMessageId: result.providerMessageId ?? null,
      providerErrorCode: result.providerErrorCode ?? null,
      errorMessage: result.errorMessage ?? null,
    } satisfies ProviderSendOutcome;
  };
}
