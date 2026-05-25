import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type SafeError = {
  message: string;
  code?: string;
  status?: number;
  name?: string;
  details?: string | null;
  hint?: string | null;
};

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}

function toSafeError(error: unknown): SafeError {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message:
        typeof record.message === "string" ? record.message : "Unknown error",
      code: typeof record.code === "string" ? record.code : undefined,
      status: typeof record.status === "number" ? record.status : undefined,
      name: typeof record.name === "string" ? record.name : undefined,
      details: typeof record.details === "string" ? record.details : null,
      hint: typeof record.hint === "string" ? record.hint : null,
    };
  }

  return { message: "Unknown error" };
}

function getSignupErrorCode(error: SafeError) {
  if (error.code === "over_email_send_rate_limit") return "rate_limit";
  if (error.code === "email_address_invalid") return "invalid_email";
  if (error.code === "user_already_exists") return "already_registered";
  if (/already registered/i.test(error.message)) return "already_registered";

  return "signup_failed";
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    return url.origin;
  } catch {
    return null;
  }
}

function getAuthCallbackUrl(request: Request, next = "/onboarding") {
  const configuredOrigin =
    process.env.NODE_ENV === "production"
      ? normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
        normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
      : null;
  const origin = configuredOrigin ?? new URL(request.url).origin;
  const callbackUrl = new URL("/callback", origin);

  if (next) callbackUrl.searchParams.set("next", next);

  return callbackUrl.toString();
}

async function deleteAuthUser(userId: string) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error) {
      console.error("[auth.signup route] Failed to clean up auth user", {
        userId,
        error: toSafeError(error),
      });
    }
  } catch (error) {
    console.error("[auth.signup route] Failed to create admin cleanup client", {
      userId,
      error: toSafeError(error),
    });
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const name = (formData.get("name") as string | null)?.trim();
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const password = formData.get("password") as string | null;

  if (!name || !email || !password) {
    return redirectTo(request, "/signup?error=missing");
  }

  if (password.length < 8) {
    return redirectTo(request, "/signup?error=password");
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: getAuthCallbackUrl(request),
    },
  });

  if (authError) {
    const safeError = toSafeError(authError);
    console.error("[auth.signup route] Supabase auth signup failed", {
      hasEmail: Boolean(email),
      error: safeError,
    });

    return redirectTo(request, `/signup?error=${getSignupErrorCode(safeError)}`);
  }

  if (!authData.user) {
    console.error("[auth.signup route] Supabase signup returned no user", {
      hasEmail: Boolean(email),
      hasSession: Boolean(authData.session),
    });

    return redirectTo(request, "/signup?error=signup_failed");
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("[auth.signup route] Missing Supabase admin configuration", {
      userId: authData.user.id,
      error: toSafeError(error),
    });

    await deleteAuthUser(authData.user.id);

    return redirectTo(request, "/signup?error=server_setup");
  }

  const { data: business, error: bizError } = await admin
    .from("businesses")
    .insert({
      name: `${name}'s Business`,
      owner_name: name,
      owner_email: email,
    })
    .select("id")
    .single();

  if (bizError || !business) {
    console.error("[auth.signup route] Business setup failed", {
      userId: authData.user.id,
      error: toSafeError(bizError),
    });

    await deleteAuthUser(authData.user.id);

    return redirectTo(request, "/signup?error=business_setup");
  }

  const { error: userError } = await admin.from("users").insert({
    id: authData.user.id,
    business_id: business.id,
    name,
    email,
    role: "owner",
  });

  if (userError) {
    console.error("[auth.signup route] User profile setup failed", {
      userId: authData.user.id,
      businessId: business.id,
      error: toSafeError(userError),
    });

    await admin.from("businesses").delete().eq("id", business.id);
    await deleteAuthUser(authData.user.id);

    return redirectTo(request, "/signup?error=profile_setup");
  }

  if (!authData.session) {
    return redirectTo(request, "/signup?message=confirm");
  }

  return redirectTo(request, "/onboarding");
}
