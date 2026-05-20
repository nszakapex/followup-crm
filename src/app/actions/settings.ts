"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { BrandVoice } from "@/types/database";

export async function updateBusinessSettings(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("users")
    .select("business_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "User profile not found." };
  if (!["owner", "manager", "admin"].includes(profile.role)) {
    return { error: "You don't have permission to update settings." };
  }

  const name = formData.get("name") as string;
  const industry = formData.get("industry") as string;
  const ownerName = formData.get("owner_name") as string;
  const ownerEmail = formData.get("owner_email") as string;
  const ownerPhone = formData.get("owner_phone") as string;
  const websiteUrl = formData.get("website_url") as string;

  if (!name) return { error: "Business name is required." };

  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      industry: industry || null,
      owner_name: ownerName || "",
      owner_email: ownerEmail || "",
      owner_phone: ownerPhone || null,
      website_url: websiteUrl || null,
    })
    .eq("id", profile.business_id);

  if (error) {
    return { error: "Failed to save settings: " + error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function updateGoogleReviewLink(formData: FormData) {
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

  const link = formData.get("google_review_link") as string;

  const { error } = await supabase
    .from("businesses")
    .update({ google_review_link: link || null })
    .eq("id", profile.business_id);

  if (error) {
    return { error: "Failed to save review link: " + error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function updateBrandVoice(voice: BrandVoice) {
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

  const { error } = await supabase
    .from("businesses")
    .update({ brand_voice: voice })
    .eq("id", profile.business_id);

  if (error) {
    return { error: "Failed to save brand voice: " + error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}
