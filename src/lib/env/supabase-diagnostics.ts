import { createClient } from "@supabase/supabase-js";

type KeyFamily = "sb_publishable" | "sb_secret" | "eyJ" | "missing" | "unknown";

type SupabaseUrlDiagnostics = {
  supabaseUrlPresent: boolean;
  supabaseUrlHost: string | null;
  supabaseProjectRefFromUrl: string | null;
};

export type SafeRuntimeDiagnostics = SupabaseUrlDiagnostics & {
  anonKeyPresent: boolean;
  anonKeyPrefix: KeyFamily;
  anonKeyLength: number;
  serviceRolePresent: boolean;
  serviceRolePrefix: KeyFamily;
  serviceRoleLength: number;
  appUrl: string | null;
  nextPublicAppUrl: string | null;
  siteUrl: string | null;
  resendPresent: boolean;
  smsEnabled: boolean;
};

export type SupabaseAnonConnectivity = {
  supabaseAnonConnectivityAttempted: boolean;
  supabaseAnonConnectivityOk: boolean;
  supabaseAnonConnectivityError: string | null;
};

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function getKeyFamily(value: string | undefined): KeyFamily {
  if (!hasValue(value)) return "missing";
  if (value!.startsWith("sb_publishable")) return "sb_publishable";
  if (value!.startsWith("sb_secret")) return "sb_secret";
  if (value!.startsWith("eyJ")) return "eyJ";
  return "unknown";
}

export function getSupabaseUrlDiagnostics(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL
): SupabaseUrlDiagnostics {
  if (!hasValue(url)) {
    return {
      supabaseUrlPresent: false,
      supabaseUrlHost: null,
      supabaseProjectRefFromUrl: null,
    };
  }

  try {
    const parsed = new URL(url!);
    const host = parsed.host;
    const [projectRef] = host.split(".");

    return {
      supabaseUrlPresent: true,
      supabaseUrlHost: host,
      supabaseProjectRefFromUrl: projectRef || null,
    };
  } catch {
    return {
      supabaseUrlPresent: true,
      supabaseUrlHost: "invalid-url",
      supabaseProjectRefFromUrl: null,
    };
  }
}

export function getSafeRuntimeDiagnostics(): SafeRuntimeDiagnostics {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    ...getSupabaseUrlDiagnostics(),
    anonKeyPresent: hasValue(anonKey),
    anonKeyPrefix: getKeyFamily(anonKey),
    anonKeyLength: anonKey?.length ?? 0,
    serviceRolePresent: hasValue(serviceRoleKey),
    serviceRolePrefix: getKeyFamily(serviceRoleKey),
    serviceRoleLength: serviceRoleKey?.length ?? 0,
    appUrl: process.env.APP_URL || null,
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL || null,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
    resendPresent: hasValue(process.env.RESEND_API_KEY),
    smsEnabled: isTruthy(process.env.SMS_ENABLED),
  };
}

export function sanitizeDiagnosticError(message: string) {
  const sensitiveValues = [
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.AUTOMATION_RUN_SECRET,
    process.env.RESEND_API_KEY,
  ].filter((value): value is string => Boolean(value && value.length >= 8));

  let sanitized = message;

  for (const value of sensitiveValues) {
    sanitized = sanitized.replaceAll(value, "[redacted]");
  }

  return sanitized.slice(0, 500);
}

export async function checkSupabaseAnonConnectivity(): Promise<SupabaseAnonConnectivity> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasValue(supabaseUrl) || !hasValue(anonKey)) {
    return {
      supabaseAnonConnectivityAttempted: false,
      supabaseAnonConnectivityOk: false,
      supabaseAnonConnectivityError:
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  try {
    const supabase = createClient(supabaseUrl!, anonKey!, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const { error } = await supabase.auth.getUser("diagnostics-invalid-token");

    if (!error) {
      return {
        supabaseAnonConnectivityAttempted: true,
        supabaseAnonConnectivityOk: true,
        supabaseAnonConnectivityError: null,
      };
    }

    const safeError = sanitizeDiagnosticError(error.message);
    const invalidApiKey = /invalid api key/i.test(safeError);

    return {
      supabaseAnonConnectivityAttempted: true,
      supabaseAnonConnectivityOk: !invalidApiKey,
      supabaseAnonConnectivityError: invalidApiKey
        ? safeError
        : `API key accepted; auth check returned expected auth error: ${safeError}`,
    };
  } catch (error) {
    return {
      supabaseAnonConnectivityAttempted: true,
      supabaseAnonConnectivityOk: false,
      supabaseAnonConnectivityError: sanitizeDiagnosticError(
        error instanceof Error ? error.message : "Unknown Supabase connectivity error."
      ),
    };
  }
}
