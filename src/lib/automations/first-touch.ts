import "server-only";

import { isSmsEnabled } from "@/lib/messaging/provider-config";
import { sendSms } from "@/lib/messaging/send-sms";
import { firstTouch } from "@/lib/sms/templates";
import { createAdminClient } from "@/lib/supabase/admin";

type FirstTouchBusiness = {
  id: string;
  name: string | null;
  owner_phone?: string | null;
  twilio_from_number?: string | null;
  sms_compliance_status?: string | null;
};

type FirstTouchLead = {
  id: string;
  first_name: string | null;
  phone: string | null;
  service_interest?: string | null;
};

export type FirstTouchResult =
  | { attempted: false; reason: string }
  | { attempted: true; sent: boolean; skipped: boolean; reason: string | null };

/**
 * T+0 instant SMS reply to a brand-new lead - the highest-ROI message in the
 * system (contact inside 5 minutes vs 30 makes contact ~100x more likely).
 *
 * Fully gated: consent, suppression, quiet hours, and the sequence cap are
 * enforced by the send path, and this helper never throws - a missing or
 * failing provider must never break lead capture. Callers invoke it inside
 * try/catch after the lead row is committed, mirroring the Resend call.
 */
export async function sendFirstTouchSms({
  business,
  lead,
}: {
  business: FirstTouchBusiness;
  lead: FirstTouchLead;
}): Promise<FirstTouchResult> {
  try {
    // Stay silent (no messages-log noise) while SMS is dark for the deployment.
    if (!isSmsEnabled()) {
      return { attempted: false, reason: "sms_disabled" };
    }

    if (!lead.phone) {
      return { attempted: false, reason: "no_phone" };
    }

    const body = firstTouch({
      businessName: business.name?.trim() || "our team",
      businessPhone: business.owner_phone,
      firstName: lead.first_name,
      serviceInterest: lead.service_interest,
    });

    const delivery = await sendSms({
      businessId: business.id,
      leadId: lead.id,
      to: lead.phone,
      body,
      optedOut: false,
      smsFromNumber: business.twilio_from_number,
      smsComplianceStatus: business.sms_compliance_status,
      kind: "first_touch",
    });

    const sentLive = delivery.success && !delivery.skipped;

    if (sentLive) {
      // Move the lead to contacted so the day 1/3/7 follow-up rules anchor on
      // this touch; keep webhook/manual status behavior otherwise unchanged.
      try {
        const admin = createAdminClient();
        await admin
          .from("leads")
          .update({ status: "contacted", last_contacted_at: new Date().toISOString() })
          .eq("id", lead.id)
          .eq("business_id", business.id)
          .eq("status", "new");
      } catch (error) {
        console.warn("[first-touch] Failed to mark lead contacted", {
          leadId: lead.id,
          error: error instanceof Error ? error.message : "Unknown update error",
        });
      }
    }

    return {
      attempted: true,
      sent: sentLive,
      skipped: Boolean(delivery.skipped),
      reason: delivery.success ? null : delivery.userMessage,
    };
  } catch (error) {
    console.error("[first-touch] First-touch SMS attempt failed", {
      leadId: lead.id,
      businessId: business.id,
      error: error instanceof Error ? error.message : "Unknown first-touch error",
    });

    return { attempted: true, sent: false, skipped: false, reason: "first_touch_exception" };
  }
}
