import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendAutomationAction } from "@/lib/automations/send-action";
import type { createClient } from "@/lib/supabase/server";
import {
  getHourInTimezone,
  isSmsProviderSendReady,
} from "@/lib/messaging/sms-compliance-core";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MAX_AUTO_SENDS_PER_BUSINESS = 25;
const QUIET_HOURS_START = 8;
const QUIET_HOURS_END = 20;

export type AutoSendSummary = {
  enabled: boolean;
  reason: string | null;
  attempted: number;
  sent: number;
  blocked: number;
  failed: number;
  results: Array<{
    actionId: string;
    leadId: string | null;
    outcome: "sent" | "skipped" | "blocked" | "failed";
    detail: string | null;
  }>;
};

function summary(enabled: boolean, reason: string | null): AutoSendSummary {
  return { enabled, reason, attempted: 0, sent: 0, blocked: 0, failed: 0, results: [] };
}

/**
 * Dispatches queued SMS follow-up actions through the provider layer.
 *
 * Runs only when the deployment is flipped live (SMS_ENABLED + real provider
 * + compliance approved) and a run explicitly allowed provider sends. Review
 * requests keep requiring a manual dashboard approval - only the lead
 * follow-up sequence is automated, matching the registered A2P campaign.
 *
 * Quiet hours are pre-checked here so due actions stay pending_review and
 * retry on the next cron run instead of being permanently marked blocked by
 * the send path. Every send still passes the full compliance gate inside
 * sendSms (consent, suppression list, sequence cap, quiet hours).
 */
export async function autoSendPendingSmsFollowUps(
  admin: SupabaseClient,
  businessId: string,
  options: { now?: Date } = {}
): Promise<AutoSendSummary> {
  if (!isSmsProviderSendReady(process.env)) {
    return summary(false, "Provider sends are not enabled for this deployment.");
  }

  const { data: businessData, error: businessError } = await admin
    .from("businesses")
    .select("timezone")
    .eq("id", businessId)
    .maybeSingle();

  if (businessError) {
    return summary(false, `Business lookup failed: ${businessError.message}`);
  }

  const timezone =
    (businessData as { timezone: string | null } | null)?.timezone ||
    process.env.BUSINESS_TIMEZONE ||
    "America/Denver";
  const hour = getHourInTimezone(options.now ?? new Date(), timezone);

  if (hour < QUIET_HOURS_START || hour >= QUIET_HOURS_END) {
    return summary(false, "Outside quiet hours window; actions stay queued for the next run.");
  }

  const { data: actions, error: actionsError } = await admin
    .from("automation_actions")
    .select("id, lead_id")
    .eq("business_id", businessId)
    .eq("status", "pending_review")
    .eq("channel", "sms")
    .eq("action_type", "follow_up_message")
    .order("created_at", { ascending: true })
    .limit(MAX_AUTO_SENDS_PER_BUSINESS);

  if (actionsError) {
    return summary(false, `Pending action lookup failed: ${actionsError.message}`);
  }

  const pending = (actions ?? []) as Array<{ id: string; lead_id: string | null }>;
  const result = summary(true, null);

  for (const action of pending) {
    result.attempted += 1;

    try {
      const sendResult = await sendAutomationAction(
        admin as unknown as SupabaseServerClient,
        businessId,
        action.id,
        null
      );

      if (sendResult.success && sendResult.sendStatus === "sent") {
        result.sent += 1;
        result.results.push({
          actionId: action.id,
          leadId: action.lead_id,
          outcome: "sent",
          detail: null,
        });
      } else if (sendResult.success) {
        result.blocked += 1;
        result.results.push({
          actionId: action.id,
          leadId: action.lead_id,
          outcome: "skipped",
          detail: sendResult.message,
        });
      } else {
        result.blocked += 1;
        result.results.push({
          actionId: action.id,
          leadId: action.lead_id,
          outcome: "blocked",
          detail: sendResult.error,
        });
      }
    } catch (error) {
      result.failed += 1;
      result.results.push({
        actionId: action.id,
        leadId: action.lead_id,
        outcome: "failed",
        detail: error instanceof Error ? error.message : "Unknown send error",
      });
    }

    // One line per lead: sent / skipped(reason), as the rollout plan requires.
    const last = result.results[result.results.length - 1];
    console.info("[automations.auto-send]", {
      businessId,
      leadId: last.leadId,
      actionId: last.actionId,
      outcome: last.outcome,
      detail: last.detail,
    });
  }

  return result;
}
