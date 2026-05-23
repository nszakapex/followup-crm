import "server-only";

import type { createClient } from "@/lib/supabase/server";

export type AutomationRunStatus = "never_run" | "completed" | "failed";
export type AutomationRunMode = "dry_run" | "confirmed";
export type AutomationRunSource = "api" | "script" | "cron";

export type AutomationRunSummary = {
  id: string | null;
  lastRunAt: string | null;
  status: AutomationRunStatus;
  dryRun: boolean | null;
  requestMode: AutomationRunMode | null;
  evaluated: number | null;
  eligible: number | null;
  actionsCreated: number | null;
  skipped: number | null;
  failures: number | null;
  duplicatesPrevented: number | null;
  providerSendsAllowed: boolean | null;
  providerSendsBlocked: boolean | null;
  source: AutomationRunSource | null;
  durationMs: number | null;
  error: string | null;
};

export type AutomationRunHistoryResult = {
  latest: AutomationRunSummary;
  recentRuns: AutomationRunSummary[];
  error: string | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AuditRunRow = {
  id: string;
  action: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

const EMPTY_LATEST: AutomationRunSummary = {
  id: null,
  lastRunAt: null,
  status: "never_run",
  dryRun: null,
  requestMode: null,
  evaluated: null,
  eligible: null,
  actionsCreated: null,
  skipped: null,
  failures: null,
  duplicatesPrevented: null,
  providerSendsAllowed: null,
  providerSendsBlocked: null,
  source: null,
  durationMs: null,
  error: null,
};

function getNumber(metadata: Record<string, unknown>, key: string, legacyKey?: string) {
  const value = metadata[key] ?? (legacyKey ? metadata[legacyKey] : undefined);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getBoolean(metadata: Record<string, unknown>, key: string, legacyKey?: string) {
  const value = metadata[key] ?? (legacyKey ? metadata[legacyKey] : undefined);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
  }
  return null;
}

function getString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeMode(
  metadata: Record<string, unknown>,
  dryRun: boolean | null
): AutomationRunMode | null {
  const requestMode = getString(metadata, "requestMode");
  if (requestMode === "dry_run" || requestMode === "confirmed") return requestMode;
  if (dryRun === null) return null;
  return dryRun ? "dry_run" : "confirmed";
}

function normalizeSource(metadata: Record<string, unknown>): AutomationRunSource | null {
  const source = getString(metadata, "source");
  if (source === "api") return "api";
  if (source === "script") return "script";
  if (source === "cron") return "cron";
  return null;
}

function normalizeRow(row: AuditRunRow): AutomationRunSummary {
  const metadata = row.metadata_json ?? {};
  const dryRun = getBoolean(metadata, "dryRun", "dry_run");
  const requestMode = normalizeMode(metadata, dryRun);
  const failures = getNumber(metadata, "failures");
  const actionFailed = row.action === "automation_run.failed";

  return {
    id: row.id,
    lastRunAt: getString(metadata, "completedAt") ?? row.created_at,
    status: actionFailed ? "failed" : "completed",
    dryRun,
    requestMode,
    evaluated: getNumber(metadata, "evaluated"),
    eligible: getNumber(metadata, "eligible"),
    actionsCreated: getNumber(metadata, "actionsCreated", "actions_created"),
    skipped: getNumber(metadata, "skipped"),
    failures,
    duplicatesPrevented: getNumber(metadata, "duplicatesPrevented", "duplicates_prevented"),
    providerSendsAllowed: getBoolean(metadata, "providerSendsAllowed"),
    providerSendsBlocked: getBoolean(metadata, "providerSendsBlocked"),
    source: normalizeSource(metadata),
    durationMs: getNumber(metadata, "durationMs"),
    error: getString(metadata, "error"),
  };
}

export async function getAutomationRunHistory(
  supabase: SupabaseServerClient,
  businessId: string,
  limit = 5
): Promise<AutomationRunHistoryResult> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, metadata_json, created_at")
    .eq("business_id", businessId)
    .in("action", ["automation_run.completed", "automation_run.failed"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      latest: EMPTY_LATEST,
      recentRuns: [],
      error: error.message,
    };
  }

  const recentRuns = ((data ?? []) as AuditRunRow[]).map(normalizeRow);

  return {
    latest: recentRuns[0] ?? EMPTY_LATEST,
    recentRuns,
    error: null,
  };
}
