"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { LeadStatus } from "@/types/database";

export async function createLead(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "User profile not found." };

  const firstName = formData.get("first_name") as string;
  const lastName = formData.get("last_name") as string;
  const phone = formData.get("phone") as string;
  const email = formData.get("email") as string;
  const source = formData.get("source") as string;
  const notes = formData.get("notes") as string;

  if (!firstName) {
    return { error: "First name is required." };
  }

  if (!phone && !email) {
    return { error: "A phone number or email is required." };
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      business_id: profile.business_id,
      first_name: firstName,
      last_name: lastName || null,
      phone: phone || null,
      email: email || null,
      source: source || "manual",
      notes: notes || null,
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    return { error: "Failed to create lead: " + error.message };
  }

  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { id: lead.id };
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const updateData: Record<string, unknown> = { status };

  // Set last_contacted_at when marking as contacted
  if (status === "contacted") {
    updateData.last_contacted_at = new Date().toISOString();
  }

  // Clear next_followup when marking as completed, lost, or booked
  if (["completed", "lost", "booked"].includes(status)) {
    updateData.next_followup_at = null;
  }

  const { error } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", leadId);

  if (error) {
    return { error: "Failed to update lead: " + error.message };
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateLead(leadId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const firstName = formData.get("first_name") as string;
  const lastName = formData.get("last_name") as string;
  const phone = formData.get("phone") as string;
  const email = formData.get("email") as string;
  const source = formData.get("source") as string;
  const notes = formData.get("notes") as string;

  if (!firstName) {
    return { error: "First name is required." };
  }

  const { error } = await supabase
    .from("leads")
    .update({
      first_name: firstName,
      last_name: lastName || null,
      phone: phone || null,
      email: email || null,
      source: source || null,
      notes: notes || null,
    })
    .eq("id", leadId);

  if (error) {
    return { error: "Failed to update lead: " + error.message };
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

export async function addLeadNote(leadId: string, note: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();
  if (!profile) return { error: "User profile not found." };

  // Create as an internal message
  const { error } = await supabase.from("messages").insert({
    business_id: profile.business_id,
    lead_id: leadId,
    channel: "manual_note",
    direction: "internal",
    body: note,
    status: "delivered",
  });

  if (error) {
    return { error: "Failed to add note: " + error.message };
  }

  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}
