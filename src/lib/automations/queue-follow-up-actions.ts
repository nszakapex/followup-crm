import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  evaluateFollowUpEligibility,
  type FollowUpEligibilityResult,
} from "@/lib/automations/follow-up-eligibility";
import { FOLLOW_UP_TEMPLATES, renderFollowUpTemplate } from "@/lib/automations/follow-up-templates";
import type { Automation, AutomationActionRecord, Business, Lead, ReviewRequest } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type QueueFollowUpActionsResult = {
  success: true;
  businessId: string;
  evaluated: number;
  created: number;
  skipped: number;
  suppressed: number;
  duplicatePrevented: number;
  blocked: number;
  results: {
    leadId: string;
    actionType: string;
    queued: boolean;
    reason: string;
    duplicatePrevented?: boolean;
  }[];
} | {
  success: false;
  error: string;
};

type QueueFollowUpActionResultItem = Extract<
  QueueFollowUpActionsResult,
  { success: true }
>["results"][number];

function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

function isDuplicateSuppression(result: FollowUpEligibilityResult) {
  return result.blockingIssues.some((issue) =>
    issue.toLowerCase().includes("matching") ||
    issue.toLowerCase().includes("duplicate")
  );
}

function buildSummary(result: FollowUpEligibilityResult, lead: Lead) {
  return `${lead.first_name} ${lead.last_name ?? ""}`.trim() +
    ` matched ${result.actionType}. ${result.reason}`;
}

export async function queueFollowUpActions(
  supabase: SupabaseServerClient,
  businessId: string,
  limit = 50
): Promise<QueueFollowUpActionsResult> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const [
    { data: businessData, error: businessError },
    { data: automationsData, error: automationsError },
    { data: leadsData, error: leadsError },
    { data: actionsData, error: actionsError },
    { data: reviewRequestsData, error: reviewRequestsError },
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, google_review_link")
      .eq("id", businessId)
      .maybeSingle(),
    supabase
      .from("automations")
      .select("*")
      .eq("business_id", businessId)
      .eq("enabled", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("leads")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(safeLimit * 4),
    supabase
      .from("automation_actions")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(safeLimit * 10),
    supabase
      .from("review_requests")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(safeLimit * 10),
  ]);

  if (businessError) return { success: false, error: `Business lookup failed: ${businessError.message}` };
  if (!businessData) return { success: false, error: "Business not found." };
  if (automationsError) return { success: false, error: `Automation lookup failed: ${automationsError.message}` };
  if (leadsError) return { success: false, error: `Lead lookup failed: ${leadsError.message}` };
  if (actionsError) return { success: false, error: `Action lookup failed: ${actionsError.message}` };
  if (reviewRequestsError) {
    return { success: false, error: `Review request lookup failed: ${reviewRequestsError.message}` };
  }

  const business = businessData as Pick<Business, "id" | "name" | "google_review_link">;
  const automations = (automationsData ?? []) as Automation[];
  const leads = (leadsData ?? []) as Lead[];
  const existingActions = (actionsData ?? []) as AutomationActionRecord[];
  const reviewRequests = (reviewRequestsData ?? []) as ReviewRequest[];
  const results: QueueFollowUpActionResultItem[] = [];
  let evaluated = 0;
  let created = 0;
  let skipped = 0;
  let suppressed = 0;
  let duplicatePrevented = 0;
  let blocked = 0;

  outer:
  for (const automation of automations) {
    for (const lead of leads) {
      if (results.length >= safeLimit) break outer;
      evaluated += 1;

      const eligibility = evaluateFollowUpEligibility({
        business,
        lead,
        automation,
        existingActions,
        reviewRequests,
      });

      if (!eligibility.canQueue || !eligibility.duplicateKey || !eligibility.rule) {
        skipped += 1;
        if (eligibility.shouldSuppress) suppressed += 1;
        if (isDuplicateSuppression(eligibility)) duplicatePrevented += 1;
        if (eligibility.blockingIssues.length > 0) blocked += 1;
        results.push({
          leadId: lead.id,
          actionType: eligibility.actionType,
          queued: false,
          reason: eligibility.suppressReason ?? eligibility.reason,
          duplicatePrevented: isDuplicateSuppression(eligibility),
        });
        continue;
      }

      const template =
        automation.message_template?.trim() ||
        FOLLOW_UP_TEMPLATES[eligibility.rule.templateKey];
      const suggestedMessage = renderFollowUpTemplate(template, business, lead);

      const { data: inserted, error: insertError } = await supabase
        .from("automation_actions")
        .insert({
          business_id: businessId,
          lead_id: lead.id,
          review_request_id: null,
          action_type: eligibility.queueActionType,
          status: "pending_review",
          channel: eligibility.recommendedChannel === "none" ? null : eligibility.recommendedChannel,
          title:
            eligibility.queueActionType === "review_request"
              ? `Review request for ${lead.first_name}`
              : `Follow-up for ${lead.first_name}`,
          summary: buildSummary(eligibility, lead),
          suggested_message: suggestedMessage,
          reason: eligibility.reason,
          reason_code: eligibility.actionType,
          source: "follow_up_queue",
          run_id: null,
          audit_log_id: null,
          dedupe_key: eligibility.duplicateKey,
          metadata_json: {
            phase: "phase_9",
            actionType: eligibility.actionType,
            recommendedDelay: eligibility.recommendedDelayLabel,
            destinationSummary: eligibility.destinationSummary,
            manualApprovalRequired: true,
            providerReadinessRequiredForSend: eligibility.providerReadinessRequiredForSend,
            providerDelivery: "not_called",
          },
        })
        .select("id")
        .single();

      if (insertError) {
        if (isUniqueViolation(insertError)) {
          skipped += 1;
          duplicatePrevented += 1;
          results.push({
            leadId: lead.id,
            actionType: eligibility.actionType,
            queued: false,
            reason: "Duplicate automation action skipped.",
            duplicatePrevented: true,
          });
          continue;
        }

        return { success: false, error: `Automation action insert failed: ${insertError.message}` };
      }

      if (inserted) {
        existingActions.push({
          id: inserted.id,
          business_id: businessId,
          lead_id: lead.id,
          review_request_id: null,
          action_type: eligibility.queueActionType,
          status: "pending_review",
          channel: eligibility.recommendedChannel === "none" ? null : eligibility.recommendedChannel,
          title: "",
          summary: null,
          suggested_message: null,
          reason: eligibility.reason,
          reason_code: eligibility.actionType,
          source: "follow_up_queue",
          run_id: null,
          audit_log_id: null,
          dedupe_key: eligibility.duplicateKey,
          metadata_json: {},
          reviewed_at: null,
          dismissed_at: null,
          approved_at: null,
          sent_at: null,
          send_status: null,
          provider: null,
          provider_message_id: null,
          provider_response_json: null,
          send_error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      created += 1;
      results.push({
        leadId: lead.id,
        actionType: eligibility.actionType,
        queued: true,
        reason: "Pending follow-up action queued for manual review.",
      });
    }
  }

  return {
    success: true,
    businessId,
    evaluated,
    created,
    skipped,
    suppressed,
    duplicatePrevented,
    blocked,
    results,
  };
}
