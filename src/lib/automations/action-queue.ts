import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AutomationActionRecord, AutomationActionStatus, Lead } from "@/types/database";

export type AutomationActionQueueItem = Pick<
  AutomationActionRecord,
  | "id"
  | "action_type"
  | "status"
  | "channel"
  | "title"
  | "summary"
  | "suggested_message"
  | "reason"
  | "reason_code"
  | "dedupe_key"
  | "metadata_json"
  | "created_at"
  | "reviewed_at"
  | "dismissed_at"
  | "sent_at"
  | "send_status"
  | "provider"
  | "provider_message_id"
  | "send_error"
> & {
  leadId: string | null;
  leadLabel: string | null;
  leadStatus: string | null;
  leadSource: string | null;
};

export type AutomationActionListResult = {
  actions: AutomationActionQueueItem[];
  error: string | null;
};

export type AutomationActionUpdateResult =
  | { success: true; status: AutomationActionStatus }
  | { success: false; error: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ActionRow = Pick<
  AutomationActionRecord,
  | "id"
  | "business_id"
  | "lead_id"
  | "action_type"
  | "status"
  | "channel"
  | "title"
  | "summary"
  | "suggested_message"
  | "reason"
  | "reason_code"
  | "dedupe_key"
  | "metadata_json"
  | "created_at"
  | "reviewed_at"
  | "dismissed_at"
  | "sent_at"
  | "send_status"
  | "provider"
  | "provider_message_id"
  | "send_error"
>;
type LeadRow = Pick<Lead, "id" | "first_name" | "last_name" | "status" | "source">;

function getLeadLabel(lead: LeadRow | undefined) {
  if (!lead) return null;
  return `${lead.first_name} ${lead.last_name ?? ""}`.trim();
}

async function attachLeadLabels(
  supabase: SupabaseServerClient,
  businessId: string,
  actions: ActionRow[]
): Promise<AutomationActionListResult> {
  const leadIds = Array.from(
    new Set(actions.map((action) => action.lead_id).filter(Boolean))
  ) as string[];

  if (leadIds.length === 0) {
    return {
      actions: actions.map((action) => ({
        ...action,
        leadId: action.lead_id,
        leadLabel: null,
        leadStatus: null,
        leadSource: null,
      })),
      error: null,
    };
  }

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, status, source")
    .eq("business_id", businessId)
    .in("id", leadIds);

  if (error) return { actions: [], error: error.message };

  const leadsById = new Map((leads ?? []).map((lead) => [lead.id, lead as LeadRow]));

  return {
    actions: actions.map((action) => {
      const lead = action.lead_id ? leadsById.get(action.lead_id) : undefined;
      return {
        ...action,
        leadId: action.lead_id,
        leadLabel: getLeadLabel(lead),
        leadStatus: lead?.status ?? null,
        leadSource: lead?.source ?? null,
      };
    }),
    error: null,
  };
}

export async function listPendingAutomationActions(
  supabase: SupabaseServerClient,
  businessId: string,
  limit = 20
): Promise<AutomationActionListResult> {
  const { data, error } = await supabase
    .from("automation_actions")
    .select(
      "id, business_id, lead_id, action_type, status, channel, title, summary, suggested_message, reason, reason_code, dedupe_key, metadata_json, created_at, reviewed_at, dismissed_at, sent_at, send_status, provider, provider_message_id, send_error"
    )
    .eq("business_id", businessId)
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { actions: [], error: error.message };

  return attachLeadLabels(supabase, businessId, (data ?? []) as ActionRow[]);
}

export async function listRecentAutomationActions(
  supabase: SupabaseServerClient,
  businessId: string,
  limit = 8
): Promise<AutomationActionListResult> {
  const { data, error } = await supabase
    .from("automation_actions")
    .select(
      "id, business_id, lead_id, action_type, status, channel, title, summary, suggested_message, reason, reason_code, dedupe_key, metadata_json, created_at, reviewed_at, dismissed_at, sent_at, send_status, provider, provider_message_id, send_error"
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { actions: [], error: error.message };

  return attachLeadLabels(supabase, businessId, (data ?? []) as ActionRow[]);
}

export async function updateAutomationActionStatus(
  supabase: SupabaseServerClient,
  businessId: string,
  actionId: string,
  nextStatus: Extract<AutomationActionStatus, "reviewed" | "dismissed">
): Promise<AutomationActionUpdateResult> {
  const { data: existing, error: selectError } = await supabase
    .from("automation_actions")
    .select("id, status, action_type, reason_code")
    .eq("id", actionId)
    .eq("business_id", businessId)
    .single();

  if (selectError || !existing) {
    return {
      success: false,
      error: selectError?.message ?? "Automation action not found.",
    };
  }

  if (existing.status !== "pending_review") {
    return {
      success: false,
      error: "Only pending automation actions can be updated.",
    };
  }

  const now = new Date().toISOString();
  const update =
    nextStatus === "reviewed"
      ? { status: nextStatus, reviewed_at: now }
      : { status: nextStatus, dismissed_at: now };

  const { data: updated, error: updateError } = await supabase
    .from("automation_actions")
    .update(update)
    .eq("id", actionId)
    .eq("business_id", businessId)
    .eq("status", "pending_review")
    .select("id, status")
    .single();

  if (updateError || !updated) {
    return {
      success: false,
      error: updateError?.message ?? "Automation action could not be updated.",
    };
  }

  try {
    const auditSupabase = createAdminClient();
    const { error: auditError } = await auditSupabase.from("audit_logs").insert({
      business_id: businessId,
      user_id: null,
      action:
        nextStatus === "reviewed"
          ? "automation_action.reviewed"
          : "automation_action.dismissed",
      entity_type: "automation_action",
      entity_id: actionId,
      metadata_json: {
        actionId,
        businessId,
        previousStatus: existing.status,
        nextStatus,
        actionType: existing.action_type,
        reasonCode: existing.reason_code,
        timestamp: now,
      },
    });

    if (auditError) {
      console.error("[automation_actions.update] Audit log failed", {
        actionId,
        businessId,
        error: auditError.message,
      });
    }
  } catch (error) {
    console.error("[automation_actions.update] Audit log unavailable", {
      actionId,
      businessId,
      error: error instanceof Error ? error.message : "Unknown audit error",
    });
  }

  return { success: true, status: updated.status as AutomationActionStatus };
}

export async function dismissAutomationAction(
  supabase: SupabaseServerClient,
  businessId: string,
  actionId: string
) {
  return updateAutomationActionStatus(supabase, businessId, actionId, "dismissed");
}

export async function markAutomationActionReviewed(
  supabase: SupabaseServerClient,
  businessId: string,
  actionId: string
) {
  return updateAutomationActionStatus(supabase, businessId, actionId, "reviewed");
}
