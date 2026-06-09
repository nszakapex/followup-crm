import { NextResponse } from "next/server";

import {
  checkSupabaseAnonConnectivity,
  getSafeRuntimeDiagnostics,
} from "@/lib/env/supabase-diagnostics";
import { safeCompareSecret } from "@/lib/webhooks/secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function isAuthorized(request: Request) {
  const expected = process.env.AUTOMATION_RUN_SECRET;
  const incoming = request.headers.get("x-automation-secret")?.trim();

  if (!expected || !incoming) return false;

  return safeCompareSecret(incoming, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return jsonResponse({ ok: false, error: "Unauthorized." }, 401);
  }

  const diagnostics = getSafeRuntimeDiagnostics();
  const connectivity = await checkSupabaseAnonConnectivity();

  return jsonResponse(
    {
      ok: true,
      ...diagnostics,
      ...connectivity,
    },
    200
  );
}
