import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runAutomations } from "@/lib/automations/run-automations";
import type { RunAutomationsResult } from "@/lib/automations/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RunRequestBody = {
  businessId?: unknown;
  dryRun?: unknown;
  confirmRun?: unknown;
  limit?: unknown;
  allowProviderSends?: unknown;
  source?: unknown;
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
      error: "Automation run API is not configured.",
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
    return (await request.json()) as RunRequestBody;
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

function parseLimit(value: unknown) {
  if (typeof value === "undefined") return undefined;

  const limit = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return null;

  return limit;
}

function getRunnerStatus(result: Extract<RunAutomationsResult, { success: false }>) {
  if (result.error === "Business id is required.") return 400;
  if (result.error === "Invalid business id.") return 400;
  if (result.error === "Business not found.") return 404;

  return 500;
}

async function logRunCompleted(
  businessId: string,
  result: Extract<RunAutomationsResult, { success: true }>,
  source: string
) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_logs").insert({
      business_id: businessId,
      user_id: null,
      action: "automation_run.completed",
      entity_type: "business",
      entity_id: businessId,
      metadata_json: {
        source,
        dry_run: result.dryRun,
        evaluated: result.evaluated,
        eligible: result.eligible,
        actions_created: result.actionsCreated,
        duplicates_prevented: result.duplicatesPrevented,
        skipped: result.skipped,
        failures: result.failures,
      },
    });

    if (error && isDevelopment()) {
      console.warn("[automations.run] Audit log failed", {
        businessId,
        error: error.message,
      });
    }
  } catch (error) {
    if (isDevelopment()) {
      console.warn("[automations.run] Audit log unavailable", {
        businessId,
        error: error instanceof Error ? error.message : "Unknown audit error",
      });
    }
  }
}

export async function POST(request: Request) {
  const auth = isAuthorized(request);

  if (!auth.ok) {
    return jsonResponse({ success: false, error: auth.error }, auth.status);
  }

  const body = await readRequestBody(request);

  if (!body) {
    return jsonResponse({ success: false, error: "Invalid automation run payload." }, 400);
  }

  const allowProviderSends = parseBoolean(body.allowProviderSends, false);

  if (allowProviderSends === null) {
    return jsonResponse(
      { success: false, error: "allowProviderSends must be a boolean." },
      400
    );
  }

  if (allowProviderSends) {
    return jsonResponse(
      {
        success: false,
        error: "Provider sends are not enabled for scheduled automation runs.",
      },
      400
    );
  }

  const businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";

  if (!businessId) {
    return jsonResponse({ success: false, error: "Business id is required." }, 400);
  }

  if (!UUID_RE.test(businessId)) {
    return jsonResponse({ success: false, error: "Invalid business id." }, 400);
  }

  const dryRun = parseBoolean(body.dryRun, true);
  const confirmRun = parseBoolean(body.confirmRun, false);

  if (dryRun === null || confirmRun === null) {
    return jsonResponse(
      { success: false, error: "dryRun and confirmRun must be booleans." },
      400
    );
  }

  if (!dryRun && !confirmRun) {
    return jsonResponse(
      {
        success: false,
        error: "Confirmed automation execution requires confirmRun=true.",
      },
      400
    );
  }

  const limit = parseLimit(body.limit);

  if (limit === null) {
    return jsonResponse(
      { success: false, error: "Limit must be an integer between 1 and 200." },
      400
    );
  }

  const source =
    body.source === "cron" || request.headers.get("x-vercel-cron")
      ? "cron"
      : "api";

  const result = await runAutomations({
    businessId,
    dryRun,
    limit,
    allowProviderSends: false,
  });

  if (!result.success) {
    const response: Record<string, unknown> = {
      success: false,
      error: result.error,
    };

    if (isDevelopment() && result.details) {
      response.details = result.details;
    }

    return jsonResponse(response, getRunnerStatus(result));
  }

  await logRunCompleted(businessId, result, source);

  return jsonResponse(result, 200);
}
