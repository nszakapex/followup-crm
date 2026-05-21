"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { MessageChannel } from "@/types/database";

async function getBusinessId() {
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

  return profile.business_id as string;
}

export async function toggleAutomation(automationId: string, enabled: boolean) {
  const businessId = await getBusinessId();
  if (!businessId) return { error: "Unauthorized." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("automations")
    .update({ enabled })
    .eq("id", automationId)
    .eq("business_id", businessId);

  if (error) {
    return { error: "Failed to update automation: " + error.message };
  }

  revalidatePath("/automations");
  return { success: true };
}

export async function updateAutomationTemplate(
  automationId: string,
  messageTemplate: string
) {
  const businessId = await getBusinessId();
  if (!businessId) return { error: "Unauthorized." };

  if (!messageTemplate.trim()) {
    return { error: "Message template cannot be empty." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("automations")
    .update({ message_template: messageTemplate.trim() })
    .eq("id", automationId)
    .eq("business_id", businessId);

  if (error) {
    return { error: "Failed to update template: " + error.message };
  }

  revalidatePath("/automations");
  return { success: true };
}

export async function updateAutomationChannel(
  automationId: string,
  channel: MessageChannel
) {
  const businessId = await getBusinessId();
  if (!businessId) return { error: "Unauthorized." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("automations")
    .update({ channel })
    .eq("id", automationId)
    .eq("business_id", businessId);

  if (error) {
    return { error: "Failed to update channel: " + error.message };
  }

  revalidatePath("/automations");
  return { success: true };
}
