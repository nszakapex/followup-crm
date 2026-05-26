import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
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

function getResetRedirectUrl(request: Request) {
  const configuredOrigin =
    process.env.NODE_ENV === "production"
      ? normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
        normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL)
      : null;
  const origin = configuredOrigin ?? new URL(request.url).origin;
  const callbackUrl = new URL("/callback", origin);
  callbackUrl.searchParams.set("next", "/update-password");

  return callbackUrl.toString();
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();

  if (!email) {
    return redirectTo(request, "/forgot-password?error=missing");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getResetRedirectUrl(request),
  });

  if (error) {
    console.error("[auth.passwordReset] Reset request failed", {
      hasEmail: Boolean(email),
      error: {
        message: error.message,
        status: error.status,
        name: error.name,
      },
    });
  }

  return redirectTo(request, "/forgot-password?message=sent");
}
