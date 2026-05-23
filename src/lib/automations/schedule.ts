import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type {
  AutomationSchedule,
  AutomationScheduleFrequency,
  AutomationScheduleStatus,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type SupabaseLikeClient = SupabaseServerClient;

export type AutomationScheduleView = {
  id: string | null;
  businessId: string;
  enabled: boolean;
  frequency: AutomationScheduleFrequency;
  timezone: string;
  preferredHour: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: AutomationScheduleStatus | null;
  lastError: string | null;
  scheduleMode: "manual_only" | "scheduled";
};

export type AutomationScheduleResult = {
  schedule: AutomationScheduleView;
  error: string | null;
};

export type EligibleSchedule = Pick<
  AutomationSchedule,
  "id" | "business_id" | "frequency" | "timezone" | "preferred_hour" | "next_run_at"
>;

const DEFAULT_TIMEZONE = "America/Denver";

function defaultSchedule(
  businessId: string,
  timezone = DEFAULT_TIMEZONE
): AutomationScheduleView {
  return {
    id: null,
    businessId,
    enabled: false,
    frequency: "manual_only",
    timezone,
    preferredHour: null,
    lastRunAt: null,
    nextRunAt: null,
    lastStatus: null,
    lastError: null,
    scheduleMode: "manual_only",
  };
}

function normalizeSchedule(row: AutomationSchedule): AutomationScheduleView {
  return {
    id: row.id,
    businessId: row.business_id,
    enabled: row.enabled,
    frequency: row.frequency,
    timezone: row.timezone,
    preferredHour: row.preferred_hour,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    scheduleMode: row.enabled && row.frequency !== "manual_only" ? "scheduled" : "manual_only",
  };
}

export function getNextScheduleRunAt(
  frequency: AutomationScheduleFrequency,
  from = new Date(),
  preferredHour: number | null = null
) {
  if (frequency === "manual_only") return null;

  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + (frequency === "weekly" ? 7 : 1));

  if (typeof preferredHour === "number") {
    next.setUTCHours(preferredHour, 0, 0, 0);
    if (next <= from) {
      next.setUTCDate(next.getUTCDate() + (frequency === "weekly" ? 7 : 1));
    }
  }

  return next.toISOString();
}

async function getBusinessTimezone(
  supabase: SupabaseLikeClient,
  businessId: string
) {
  const { data, error } = await supabase
    .from("businesses")
    .select("timezone")
    .eq("id", businessId)
    .maybeSingle();

  if (error) return { timezone: DEFAULT_TIMEZONE, error: error.message };

  return {
    timezone:
      typeof data?.timezone === "string" && data.timezone.trim()
        ? data.timezone.trim()
        : DEFAULT_TIMEZONE,
    error: null,
  };
}

export async function getAutomationScheduleForBusiness(
  supabase: SupabaseServerClient,
  businessId: string
): Promise<AutomationScheduleResult> {
  const { data, error } = await supabase
    .from("automation_schedules")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) return { schedule: defaultSchedule(businessId), error: error.message };

  if (data) {
    return {
      schedule: normalizeSchedule(data as AutomationSchedule),
      error: null,
    };
  }

  const timezone = await getBusinessTimezone(supabase, businessId);

  return {
    schedule: defaultSchedule(businessId, timezone.timezone),
    error: timezone.error,
  };
}

export async function upsertAutomationSchedule(
  supabase: SupabaseServerClient,
  businessId: string,
  settings: {
    enabled: boolean;
    frequency: AutomationScheduleFrequency;
    timezone?: string | null;
    preferredHour?: number | null;
  }
) {
  const timezone =
    settings.timezone?.trim() ||
    (await getBusinessTimezone(supabase, businessId)).timezone;
  const now = new Date();
  const nextRunAt = settings.enabled
    ? getNextScheduleRunAt(settings.frequency, now, settings.preferredHour ?? null)
    : null;

  const { data, error } = await supabase
    .from("automation_schedules")
    .upsert(
      {
        business_id: businessId,
        enabled: settings.enabled,
        frequency: settings.frequency,
        timezone,
        preferred_hour: settings.preferredHour ?? null,
        next_run_at: nextRunAt,
      },
      { onConflict: "business_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    return {
      success: false as const,
      error: error?.message ?? "Automation schedule could not be saved.",
    };
  }

  return {
    success: true as const,
    schedule: normalizeSchedule(data as AutomationSchedule),
  };
}

export async function listBusinessesEligibleForScheduledAutomation(
  supabase: SupabaseLikeClient,
  limit: number,
  now = new Date()
) {
  const { data, error } = await supabase
    .from("automation_schedules")
    .select("id, business_id, frequency, timezone, preferred_hour, next_run_at")
    .eq("enabled", true)
    .in("frequency", ["daily", "weekly"])
    .or(`next_run_at.is.null,next_run_at.lte.${now.toISOString()}`)
    .order("next_run_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    return { schedules: [] as EligibleSchedule[], error: error.message };
  }

  return {
    schedules: (data ?? []) as EligibleSchedule[],
    error: null,
  };
}

export async function updateScheduleRunResult(
  supabase: SupabaseLikeClient,
  businessId: string,
  result: {
    success: boolean;
    dryRun: boolean;
    error?: string | null;
    completedAt?: string;
  }
) {
  const completedAt = result.completedAt ?? new Date().toISOString();
  const { data: existing, error: selectError } = await supabase
    .from("automation_schedules")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (selectError) return { success: false as const, error: selectError.message };

  const schedule = existing as AutomationSchedule | null;
  const frequency = schedule?.frequency ?? "manual_only";
  const enabled = schedule?.enabled ?? false;
  const preferredHour = schedule?.preferred_hour ?? null;
  const nextRunAt =
    enabled && frequency !== "manual_only"
      ? getNextScheduleRunAt(frequency, new Date(completedAt), preferredHour)
      : null;

  const timezone =
    schedule?.timezone ??
    (await getBusinessTimezone(supabase, businessId)).timezone;

  const { error } = await supabase.from("automation_schedules").upsert(
    {
      business_id: businessId,
      enabled,
      frequency,
      timezone,
      preferred_hour: preferredHour,
      last_run_at: completedAt,
      next_run_at: nextRunAt,
      last_status: result.success ? "completed" : "failed",
      last_error: result.error ? result.error.slice(0, 500) : null,
    },
    { onConflict: "business_id" }
  );

  if (error) return { success: false as const, error: error.message };

  return { success: true as const };
}
