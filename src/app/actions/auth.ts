"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

type SafeError = {
  message: string;
  code?: string;
  status?: number;
  name?: string;
  details?: string | null;
  hint?: string | null;
};

function toSafeError(error: unknown): SafeError {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message: typeof record.message === "string" ? record.message : "Unknown error",
      code: typeof record.code === "string" ? record.code : undefined,
      status: typeof record.status === "number" ? record.status : undefined,
      name: typeof record.name === "string" ? record.name : undefined,
      details: typeof record.details === "string" ? record.details : null,
      hint: typeof record.hint === "string" ? record.hint : null,
    };
  }

  return { message: "Unknown error" };
}

function getSignupAuthMessage(error: SafeError) {
  if (error.code === "over_email_send_rate_limit") {
    return "Supabase is rate limiting signup emails. For local smoke testing, disable email confirmation in Supabase Auth settings, then try again.";
  }

  if (error.code === "email_address_invalid") {
    return "Supabase rejected that email address. Use a real test email address instead of an example.com placeholder.";
  }

  if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
    return "That email is already registered. Try signing in or use a different test email.";
  }

  return `Signup failed: ${error.message}`;
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

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const origin = normalizeOrigin(requestHeaders.get("origin"));
  if (origin) return origin;

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return null;

  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const proto =
    forwardedProto ?? (process.env.NODE_ENV === "production" ? "https" : "http");

  return normalizeOrigin(`${proto}://${host}`);
}

async function getAuthCallbackUrl(next = "/dashboard") {
  const configuredOrigin =
    process.env.NODE_ENV === "production"
      ? normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
        normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
      : null;
  const origin =
    configuredOrigin ?? (await getRequestOrigin()) ?? "http://localhost:3000";
  const callbackUrl = new URL("/callback", origin);

  if (next) callbackUrl.searchParams.set("next", next);

  return callbackUrl.toString();
}

async function deleteAuthUser(userId: string) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error) {
      console.error("[auth.signUp] Failed to clean up auth user after setup error", {
        userId,
        error: toSafeError(error),
      });
    }
  } catch (error) {
    console.error("[auth.signUp] Failed to create admin client for auth cleanup", {
      userId,
      error: toSafeError(error),
    });
  }
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    return { error: "All fields are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: await getAuthCallbackUrl("/onboarding"),
    },
  });

  if (authError) {
    const safeError = toSafeError(authError);
    console.error("[auth.signUp] Supabase auth signup failed", {
      email,
      error: safeError,
    });

    return { error: getSignupAuthMessage(safeError) };
  }

  if (!authData.user) {
    console.error("[auth.signUp] Supabase signup returned no user", {
      email,
      hasSession: Boolean(authData.session),
    });

    return {
      error: "Supabase did not return a user for this signup. Check Auth settings and try again.",
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("[auth.signUp] Missing Supabase admin configuration", {
      email,
      userId: authData.user.id,
      error: toSafeError(error),
    });

    await deleteAuthUser(authData.user.id);

    return {
      error:
        "Account authentication succeeded, but server-side Supabase setup is missing. Check SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    };
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
    console.error("[auth.signUp] Business setup failed", {
      email,
      userId: authData.user.id,
      error: toSafeError(bizError),
    });

    await deleteAuthUser(authData.user.id);

    return {
      error:
        "Account authentication succeeded, but business setup failed. Check the server console for the Supabase database error.",
    };
  }

  const { error: userError } = await admin.from("users").insert({
    id: authData.user.id,
    business_id: business.id,
    name,
    email,
    role: "owner",
  });

  if (userError) {
    console.error("[auth.signUp] User profile setup failed", {
      email,
      userId: authData.user.id,
      businessId: business.id,
      error: toSafeError(userError),
    });

    await admin.from("businesses").delete().eq("id", business.id);
    await deleteAuthUser(authData.user.id);

    return {
      error:
        "Account authentication succeeded, but user profile setup failed. Check the server console for the Supabase database error.",
    };
  }

  if (!authData.session) {
    console.info("[auth.signUp] Signup created profile but returned no session", {
      email,
      userId: authData.user.id,
    });

    return {
      message:
        "Account created. Confirm your email, then sign in to continue onboarding.",
    };
  }

  redirect("/onboarding");
}

type AuthActionState = {
  error?: string | null;
  message?: string | null;
};

export async function signUpFormAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  return (await signUp(formData)) ?? { error: null, message: null };
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signInFormAction(
  _previousState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  return (await signIn(formData)) ?? { error: null, message: null };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
