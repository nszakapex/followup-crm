"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { BrandVoice } from "@/types/database";

function normalizeOptionalUrl(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return { value: null };

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: `${label} must start with http:// or https://.` };
    }
    return { value: url.toString() };
  } catch {
    return { error: `${label} must be a valid URL.` };
  }
}

function isValidEmail(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidTimezone(value: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function updateBusinessSettings(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { error: "User profile not found: " + (profileError?.message ?? "missing row") };
  }
  if (!["owner", "manager", "admin"].includes(profile.role)) {
    return { error: "You don't have permission to update settings." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const ownerName = String(formData.get("owner_name") ?? "").trim();
  const ownerEmail = String(formData.get("owner_email") ?? "").trim();
  const ownerPhone = String(formData.get("owner_phone") ?? "").trim();
  const websiteUrl = String(formData.get("website_url") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "America/Denver").trim();

  if (!name) return { error: "Business name is required." };
  if (!isValidEmail(ownerEmail)) return { error: "Owner email must be a valid email address." };
  if (!isValidTimezone(timezone)) return { error: "Timezone must be a valid IANA timezone." };

  const normalizedWebsite = normalizeOptionalUrl(websiteUrl, "Website");
  if (normalizedWebsite.error) return { error: normalizedWebsite.error };

  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      industry: industry || null,
      owner_name: ownerName || "",
      owner_email: ownerEmail || "",
      owner_phone: ownerPhone || null,
      website_url: normalizedWebsite.value,
      timezone,
    })
    .eq("id", profile.business_id);

  if (error) {
    return { error: "Failed to save settings: " + error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/setup");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateGoogleReviewLink(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return { error: "User profile not found: " + (profileError?.message ?? "missing row") };
  }

  const link = String(formData.get("google_review_link") ?? "").trim();
  const normalizedLink = normalizeOptionalUrl(link, "Google review link");
  if (normalizedLink.error) return { error: normalizedLink.error };

  const { error } = await supabase
    .from("businesses")
    .update({ google_review_link: normalizedLink.value })
    .eq("id", profile.business_id);

  if (error) {
    return { error: "Failed to save review link: " + error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/setup");
  revalidatePath("/dashboard");
  revalidatePath("/reviews");
  return { success: true };
}

export async function updateBrandVoice(voice: BrandVoice) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return { error: "User profile not found: " + (profileError?.message ?? "missing row") };
  }

  const { error } = await supabase
    .from("businesses")
    .update({ brand_voice: voice })
    .eq("id", profile.business_id);

  if (error) {
    return { error: "Failed to save brand voice: " + error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/setup");
  return { success: true };
}
