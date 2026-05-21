import "server-only";

import { createClient } from "@/lib/supabase/server";

interface AdminCheckResult {
  authorized: boolean;
  userId: string | null;
  businessId: string | null;
  error?: string;
}

/**
 * Server-only guard that verifies the current user has the "admin" role.
 *
 * Usage in server components or server actions:
 *   const admin = await requireAdmin();
 *   if (!admin.authorized) {
 *     // handle unauthorized
 *   }
 */
export async function requireAdmin(): Promise<AdminCheckResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authorized: false,
      userId: null,
      businessId: null,
      error: "Not authenticated.",
    };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("business_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return {
      authorized: false,
      userId: user.id,
      businessId: null,
      error: "User profile not found.",
    };
  }

  if (profile.role !== "admin") {
    return {
      authorized: false,
      userId: user.id,
      businessId: profile.business_id,
      error: "You do not have admin access.",
    };
  }

  return {
    authorized: true,
    userId: user.id,
    businessId: profile.business_id,
  };
}
