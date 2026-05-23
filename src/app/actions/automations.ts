"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { MessageChannel } from "@/types/database";
import {
  dismissAutomationAction as dismissAutomationActionRecord,
  markAutomationActionReviewed as markAutomationActionRecordReviewed,
} from "@/lib/automations/action-queue";
import { upsertAutomationSchedule } from "@/lib/automations/schedule";
import { sendAutomationAction as sendAutomationActionRecord } from "@/lib/automations/send-action";

type AuthContext =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      businessId: string;
      userId: string;
    }
  | { ok: false; reason: string };

type ToggleAutomationResult =
  | { success: true; enabled: boolean }
  | { success: false; error: string };

const MANAGE_ROLES = ["owner", "manager", "admin"];

function revalidateAutomationActionSurfaces() {
  revalidatePath("/automations");
  revalidatePath("/leads/[id]", "page");
}

async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, reason: "Not signed in" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("[automations.auth] Business user row missing", {
      userId: user.id,
      error: profileError?.message ?? null,
    });
    return { ok: false, reason: "Business user row missing" };
  }

  if (!MANAGE_ROLES.includes(profile.role)) {
    return {
      ok: false,
      reason: "Only owners and managers can change automations",
    };
  }

  return { ok: true, supabase, businessId: profile.business_id as string, userId: user.id };
}

export async function toggleAutomation(
  automationId: string,
  enabled: boolean
): Promise<ToggleAutomationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("[automations.toggle] Not signed in", { automationId });
    return { success: false as const, error: "Not signed in" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, business_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("[automations.toggle] Business user row missing", {
      userId: user.id,
      profileError: profileError?.message ?? null,
    });
    return { success: false as const, error: "Business user row missing" };
  }

  if (!MANAGE_ROLES.includes(profile.role)) {
    console.error("[automations.toggle] Insufficient role", {
      userId: user.id,
      businessId: profile.business_id,
      role: profile.role,
      automationId,
    });
    return { success: false as const, error: "Only owners and managers can change automations" };
  }

  const businessId = profile.business_id as string;

  // Select-before-update: confirm the row exists and belongs to this business.
  const {
    data: existing,
    error: selectError,
    count: selectCount,
  } = await supabase
    .from("automations")
    .select("id, enabled", { count: "exact" })
    .eq("id", automationId)
    .eq("business_id", businessId);

  if (selectError) {
    console.error("[automations.toggle] Select failed", {
      automationId,
      businessId,
      error: selectError.message,
    });
    return { success: false as const, error: "Supabase update failed: " + selectError.message };
  }

  if (!existing || existing.length === 0) {
    console.error("[automations.toggle] Automation row not found", {
      automationId,
      businessId,
      selectCount: selectCount ?? 0,
    });
    return { success: false as const, error: "Automation row not found" };
  }

  // Update scoped by BOTH automation id and business_id, returning the row so
  // we can detect a 0-row update (the signature of an RLS block).
  const {
    data: updated,
    error: updateError,
  } = await supabase
    .from("automations")
    .update({ enabled })
    .eq("id", automationId)
    .eq("business_id", businessId)
    .select("id, enabled");

  if (updateError) {
    console.error("[automations.toggle] Supabase update failed", {
      automationId,
      businessId,
      targetEnabled: enabled,
      error: updateError.message,
      code: (updateError as { code?: string }).code ?? null,
    });
    return { success: false as const, error: "Supabase update failed: " + updateError.message };
  }

  if (!updated || updated.length === 0) {
    // No error but no row changed → RLS with-check rejected the write silently.
    console.error("[automations.toggle] RLS blocked update", {
      automationId,
      businessId,
      targetEnabled: enabled,
    });
    return { success: false as const, error: "RLS blocked update" };
  }

  revalidatePath("/automations");
  return { success: true as const, enabled: updated[0].enabled as boolean };
}

export async function updateAutomationTemplate(
  automationId: string,
  messageTemplate: string
) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { error: ctx.reason };

  if (!messageTemplate.trim()) {
    return { error: "Message template cannot be empty." };
  }

  const { supabase, businessId } = ctx;

  const { error } = await supabase
    .from("automations")
    .update({ message_template: messageTemplate.trim() })
    .eq("id", automationId)
    .eq("business_id", businessId);

  if (error) {
    console.error("[automations.updateTemplate] Failed", {
      automationId,
      error: error.message,
    });
    return { error: "Failed to update template: " + error.message };
  }

  revalidatePath("/automations");
  return { success: true };
}

export async function updateAutomationChannel(
  automationId: string,
  channel: MessageChannel
) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { error: ctx.reason };

  const { supabase, businessId } = ctx;

  const { error } = await supabase
    .from("automations")
    .update({ channel })
    .eq("id", automationId)
    .eq("business_id", businessId);

  if (error) {
    console.error("[automations.updateChannel] Failed", {
      automationId,
      error: error.message,
    });
    return { error: "Failed to update channel: " + error.message };
  }

  revalidatePath("/automations");
  return { success: true };
}

export async function markAutomationActionReviewed(actionId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.ok) {
    console.error("[automationActions.reviewed] Auth failed", {
      actionId,
      error: ctx.reason,
    });
    return;
  }

  const result = await markAutomationActionRecordReviewed(
    ctx.supabase,
    ctx.businessId,
    actionId
  );

  if (!result.success) {
    console.error("[automationActions.reviewed] Failed", {
      actionId,
      businessId: ctx.businessId,
      error: result.error,
    });
    return;
  }

  revalidateAutomationActionSurfaces();
}

export async function dismissAutomationAction(actionId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.ok) {
    console.error("[automationActions.dismissed] Auth failed", {
      actionId,
      error: ctx.reason,
    });
    return;
  }

  const result = await dismissAutomationActionRecord(
    ctx.supabase,
    ctx.businessId,
    actionId
  );

  if (!result.success) {
    console.error("[automationActions.dismissed] Failed", {
      actionId,
      businessId: ctx.businessId,
      error: result.error,
    });
    return;
  }

  revalidateAutomationActionSurfaces();
}

export async function sendAutomationAction(actionId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.ok) {
    console.error("[automationActions.send] Auth failed", {
      actionId,
      error: ctx.reason,
    });
    return;
  }

  const result = await sendAutomationActionRecord(
    ctx.supabase,
    ctx.businessId,
    actionId,
    ctx.userId
  );

  if (!result.success) {
    console.error("[automationActions.send] Failed", {
      actionId,
      businessId: ctx.businessId,
      error: result.error,
    });
  }

  revalidateAutomationActionSurfaces();
}

export async function enableDailyAutomationSchedule(): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.ok) {
    console.error("[automationSchedule.enable] Auth failed", {
      error: ctx.reason,
    });
    return;
  }

  const result = await upsertAutomationSchedule(ctx.supabase, ctx.businessId, {
    enabled: true,
    frequency: "daily",
    preferredHour: 9,
  });

  if (!result.success) {
    console.error("[automationSchedule.enable] Failed", {
      businessId: ctx.businessId,
      error: result.error,
    });
  }

  revalidatePath("/automations");
}

export async function pauseAutomationSchedule(): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.ok) {
    console.error("[automationSchedule.pause] Auth failed", {
      error: ctx.reason,
    });
    return;
  }

  const result = await upsertAutomationSchedule(ctx.supabase, ctx.businessId, {
    enabled: false,
    frequency: "manual_only",
  });

  if (!result.success) {
    console.error("[automationSchedule.pause] Failed", {
      businessId: ctx.businessId,
      error: result.error,
    });
  }

  revalidatePath("/automations");
}
