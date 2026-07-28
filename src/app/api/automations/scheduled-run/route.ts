import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { autoSendPendingSmsFollowUps, type AutoSendSummary } from "@/lib/automations/auto-send";
import { evaluateProviderSendRequest } from "@/lib/automations/route-safety";
import { runAutomations } from "@/lib/automations/run-automations";
import {
  listBusinessesEligibleForScheduledAutomation,
  updateScheduleRunResult,
} from "@/lib/automations/schedule";
import type { RunAutomationsResult } from "@/lib/automations/types";
import { isSmsProviderSendReady } from "@/lib/messaging/sms-compliance-core";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTE_PATH = "/api/automations/scheduled-run";
const DEFAULT_BUSINESS_LIMIT = 10;
const HARD_MAX_BUSINESS_LIMIT = 25;
const DEFAULT_AUTOMATION_LIMIT = 50;
const HARD_MAX_AUTOMATION_LIMIT = 200;

type ScheduledRunRequestBody = {
  businessId?: unknown;
  dryRun?: unknown;
  confirmRun?: unknown;
  limit?: unknown;
  automationLimit?: unknown;
  allowProviderSends?: unknown;
};

type BusinessRunSummary = {
  businessId: string;
  success: boolean;
  evaluated: number;
  eligible: number;
  actionsCreated: number;
  skipped: number;
  failures: number;
  duplicatesPrevented: number;
  providerSends?: {
    attempted: number;
    sent: number;
    blocked: number;
    failed: number;
    reason: string | null;
  };
  error?: string;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

function safeCompareSecret(incoming: string, stored: string) {
  const incomingBuffer = Buffer.from(incoming);
  const storedBuffer = Buffer.from(stored);

  if (incomingBuffer.length !== storedBuffer.length) return false;

  return timingSafeEqual(incomingBuffer, storedBuffer);
}

function getExpectedSecret() {
  return process.env.AUTOMATION_RUN_SECRET || process.env.CRON_SECRET || null;
}

function getIncomingSecret(request: Request) {
  const authorization = request.headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);

  if (bearerMatch?.[1]) return bearerMatch[1].trim();

  return request.headers.get("x-automation-secret")?.trim() || null;
}

function isAuthorized(request: Request) {
  const incomingSecret = getIncomingSecret(request);

  if (!incomingSecret) {
    return {
      ok: false as const,
      status: 401,
      error: "Automation run secret is invalid.",
    };
  }

  const expectedSecret = getExpectedSecret();

  if (!expectedSecret) {
    return {
      ok: false as const,
      status: 503,
      error: "Automation scheduler is not configured.",
    };
  }

  if (!safeCompareSecret(incomingSecret, expectedSecret)) {
    return {
      ok: false as const,
      status: 401,
      error: "Automation run secret is invalid.",
    };
  }

  return { ok: true as const };
}

async function readRequestBody(request: Request) {
  try {
    return (await request.json()) as ScheduledRunRequestBody;
  } catch {
    return null;
  }
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "undefined") return fallback;
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }

  return null;
}

function getConfiguredMaxBusinesses() {
  const configured = Number(process.env.AUTOMATION_SCHEDULER_MAX_BUSINESSES);

  if (!Number.isInteger(configured) || configured < 1) return DEFAULT_BUSINESS_LIMIT;

  return Math.min(configured, HARD_MAX_BUSINESS_LIMIT);
}

function parseBusinessLimit(value: unknown) {
  const max = getConfiguredMaxBusinesses();
  if (typeof value === "undefined") return max;

  const limit = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > max) return null;

  return limit;
}

function parseAutomationLimit(value: unknown) {
  if (typeof value === "undefined") return DEFAULT_AUTOMATION_LIMIT;

  const limit = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > HARD_MAX_AUTOMATION_LIMIT) {
    return null;
  }

  return limit;
}

function summarizeResult(
  businessId: string,
  result: RunAutomationsResult
): BusinessRunSummary {
  if (!result.success) {
    return {
      businessId,
      success: false,
      evaluated: 0,
      eligible: 0,
      actionsCreated: 0,
      skipped: 0,
      failures: 1,
      duplicatesPrevented: 0,
      error: result.error,
    };
  }

  return {
    businessId,
    success: true,
    evaluated: result.evaluated,
    eligible: result.eligible,
    actionsCreated: result.actionsCreated,
    skipped: result.skipped,
    failures: result.failures,
    duplicatesPrevented: result.duplicatesPrevented,
  };
}

function sanitizeError(error: string) {
  return error.slice(0, 500);
}

async function logSchedulerEvent({
  businessId,
  action,
  metadata,
}: {
  businessId: string;
  action:
    | "automation_scheduler.business_completed"
    | "automation_scheduler.business_failed";
  metadata: Record<string, unknown>;
}) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_logs").insert({
      business_id: businessId,
      user_id: null,
      action,
      entity_type: "business",
      entity_id: businessId,
      metadata_json: metadata,
    });

    if (error && isDevelopment()) {
      console.warn("[automations.scheduler] Audit log failed", {
        businessId,
        action,
        error: error.message,
      });
    }
  } catch (error) {
    if (isDevelopment()) {
      console.warn("[automations.scheduler] Audit log unavailable", {
        businessId,
        action,
        error: error instanceof Error ? error.message : "Unknown audit error",
      });
    }
  }
}

function buildBusinessMetadata({
  dryRun,
  confirmRun,
  summary,
  completedAt,
  durationMs,
  source,
  providerSendsAllowed,
}: {
  dryRun: boolean;
  confirmRun: boolean;
  summary: BusinessRunSummary;
  completedAt: string;
  durationMs: number;
  source: "scheduler" | "cron";
  providerSendsAllowed: boolean;
}) {
  return {
    scheduledRun: true,
    businessId: summary.businessId,
    dryRun,
    confirmRun,
    evaluated: summary.evaluated,
    eligible: summary.eligible,
    actionsCreated: summary.actionsCreated,
    skipped: summary.skipped,
    failures: summary.failures,
    duplicatesPrevented: summary.duplicatesPrevented,
    providerSendsAllowed,
    providerSendsBlocked: !providerSendsAllowed,
    providerSends: summary.providerSends ?? null,
    source,
    route: ROUTE_PATH,
    completedAt,
    durationMs,
    requestMode: dryRun ? "dry_run" : "confirmed",
    error: summary.error ? sanitizeError(summary.error) : null,
  };
}

type ScheduledRunParams = {
  dryRun: boolean;
  confirmRun: boolean;
  businessLimit: number;
  automationLimit: number;
  suppliedBusinessId: string;
  providerSendsAllowed: boolean;
  source: "scheduler" | "cron";
  startedAt: number;
};

/**
 * Vercel Cron invokes with GET and `Authorization: Bearer $CRON_SECRET`.
 * A cron tick is the explicit scheduled intent, so it runs confirmed
 * (dryRun=false) with defaults, and provider sends are allowed exactly when
 * the deployment env is flipped live (SMS_ENABLED + real provider +
 * compliance approved) - the same gate the POST body flag goes through.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const auth = isAuthorized(request);

  if (!auth.ok) {
    return jsonResponse({ success: false, error: auth.error }, auth.status);
  }

  return executeScheduledRun({
    dryRun: false,
    confirmRun: true,
    businessLimit: getConfiguredMaxBusinesses(),
    automationLimit: DEFAULT_AUTOMATION_LIMIT,
    suppliedBusinessId: "",
    providerSendsAllowed: isSmsProviderSendReady(process.env),
    source: "cron",
    startedAt,
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const auth = isAuthorized(request);

  if (!auth.ok) {
    return jsonResponse({ success: false, error: auth.error }, auth.status);
  }

  const body = await readRequestBody(request);

  if (!body) {
    return jsonResponse({ success: false, error: "Invalid scheduled automation payload." }, 400);
  }

  const dryRun = parseBoolean(body.dryRun, true);
  const confirmRun = parseBoolean(body.confirmRun, false);

  if (dryRun === null || confirmRun === null) {
    return jsonResponse(
      { success: false, error: "dryRun and confirmRun must be booleans." },
      400
    );
  }

  const providerSendPolicy = evaluateProviderSendRequest(body.allowProviderSends);

  if (!providerSendPolicy.ok) {
    return jsonResponse(
      {
        success: false,
        error: providerSendPolicy.error,
      },
      providerSendPolicy.status
    );
  }

  if (!dryRun && !confirmRun) {
    return jsonResponse(
      {
        success: false,
        error: "Confirmed scheduled automation execution requires confirmRun=true.",
      },
      400
    );
  }

  const businessLimit = parseBusinessLimit(body.limit);
  if (businessLimit === null) {
    return jsonResponse(
      {
        success: false,
        error: `Limit must be an integer between 1 and ${getConfiguredMaxBusinesses()}.`,
      },
      400
    );
  }

  const automationLimit = parseAutomationLimit(body.automationLimit);
  if (automationLimit === null) {
    return jsonResponse(
      {
        success: false,
        error: "automationLimit must be an integer between 1 and 200.",
      },
      400
    );
  }

  const suppliedBusinessId =
    typeof body.businessId === "string" ? body.businessId.trim() : "";

  if (suppliedBusinessId && !UUID_RE.test(suppliedBusinessId)) {
    return jsonResponse({ success: false, error: "Invalid business id." }, 400);
  }

  return executeScheduledRun({
    dryRun,
    confirmRun,
    businessLimit,
    automationLimit,
    suppliedBusinessId,
    providerSendsAllowed: providerSendPolicy.requested,
    source: request.headers.get("x-vercel-cron") ? "cron" : "scheduler",
    startedAt,
  });
}

async function executeScheduledRun({
  dryRun,
  confirmRun,
  businessLimit,
  automationLimit,
  suppliedBusinessId,
  providerSendsAllowed,
  source,
  startedAt,
}: ScheduledRunParams) {
  const admin = createAdminClient();
  const businessIds: string[] = [];

  if (suppliedBusinessId) {
    businessIds.push(suppliedBusinessId);
  } else {
    const eligible = await listBusinessesEligibleForScheduledAutomation(
      admin,
      businessLimit
    );

    if (eligible.error) {
      return jsonResponse(
        {
          success: false,
          error: isDevelopment()
            ? `Failed to list eligible businesses: ${eligible.error}`
            : "Failed to list eligible businesses.",
        },
        500
      );
    }

    businessIds.push(...eligible.schedules.map((schedule) => schedule.business_id));
  }

  const results: BusinessRunSummary[] = [];

  for (const businessId of businessIds) {
    // The runner is queue-only by design (allowProviderSends:true makes it
    // skip candidates); dispatch happens in the auto-send phase below.
    const result = await runAutomations({
      businessId,
      dryRun,
      limit: automationLimit,
      allowProviderSends: false,
    });
    const summary = summarizeResult(businessId, result);

    // Dispatch phase: after the runner queues follow-up actions, send the
    // eligible SMS ones through the compliance-gated provider layer.
    if (!dryRun && providerSendsAllowed && summary.success) {
      const autoSend: AutoSendSummary = await autoSendPendingSmsFollowUps(admin, businessId);
      summary.providerSends = {
        attempted: autoSend.attempted,
        sent: autoSend.sent,
        blocked: autoSend.blocked,
        failed: autoSend.failed,
        reason: autoSend.reason,
      };
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;

    results.push(summary);

    await updateScheduleRunResult(admin, businessId, {
      success: summary.success,
      dryRun,
      error: summary.error ?? null,
      completedAt,
    });

    await logSchedulerEvent({
      businessId,
      action: summary.success
        ? "automation_scheduler.business_completed"
        : "automation_scheduler.business_failed",
      metadata: buildBusinessMetadata({
        dryRun,
        confirmRun,
        summary,
        completedAt,
        durationMs,
        source,
        providerSendsAllowed,
      }),
    });
  }

  const businessesFailed = results.filter((result) => !result.success).length;
  const totals = results.reduce(
    (acc, result) => ({
      evaluated: acc.evaluated + result.evaluated,
      eligible: acc.eligible + result.eligible,
      actionsCreated: acc.actionsCreated + result.actionsCreated,
      skipped: acc.skipped + result.skipped,
      failures: acc.failures + result.failures,
      duplicatesPrevented: acc.duplicatesPrevented + result.duplicatesPrevented,
    }),
    {
      evaluated: 0,
      eligible: 0,
      actionsCreated: 0,
      skipped: 0,
      failures: 0,
      duplicatesPrevented: 0,
    }
  );

  return jsonResponse(
    {
      success: businessesFailed === 0,
      dryRun,
      confirmRun,
      scheduledRun: true,
      businessesEvaluated: businessIds.length,
      businessesRun: results.length,
      businessesFailed,
      totalEvaluated: totals.evaluated,
      totalEligible: totals.eligible,
      totalActionsCreated: totals.actionsCreated,
      totalSkipped: totals.skipped,
      totalFailures: totals.failures,
      totalDuplicatesPrevented: totals.duplicatesPrevented,
      providerSendsAllowed,
      providerSendsBlocked: !providerSendsAllowed,
      totalProviderSendsSent: results.reduce(
        (acc, result) => acc + (result.providerSends?.sent ?? 0),
        0
      ),
      results,
      durationMs: Date.now() - startedAt,
    },
    200
  );
}
