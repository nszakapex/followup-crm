"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { MessageChannel } from "@/types/database";

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("business_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  if (!["owner", "manager", "admin"].includes(profile.role)) return null;

  return { supabase, businessId: profile.business_id as string };
}

export async function toggleAutomation(automationId: string, enabled: boolean) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Unauthorized. Only owners and managers can change automations." };

  const { supabase, businessId } = ctx;

  // Verify the automation exists and belongs to this business
  const { data: existing } = await supabase
    .from("automations")
    .select("id, enabled")
    .eq("id", automationId)
    .eq("business_id", businessId)
    .single();

  if (!existing) {
    console.error("[automations.toggle] Automation not found", { automationId, businessId });
    return { error: "Automation not found." };
  }

  const { error, data } = await supabase
    .from("automations")
    .update({ enabled })
    .eq("id", automationId)
    .eq("business_id", businessId)
    .select("id");

  if (error) {
    console.error("[automations.toggle] Update failed", {
      automationId,
      businessId,
      enabled,
      error: error.message,
      code: error.code,
    });
    return { error: "Failed to update automation: " + error.message };
  }

  if (!data || data.length === 0) {
    console.error("[automations.toggle] Update matched 0 rows (likely RLS)", {
      automationId,
      businessId,
      enabled,
    });
    return { error: "Update was blocked. Check your account permissions." };
  }

  revalidatePath("/automations");
  return { success: true };
}

export async function updateAutomationTemplate(
  automationId: string,
  messageTemplate: string
) {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Unauthorized." };

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
  if (!ctx) return { error: "Unauthorized." };

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
