import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = formData.get("password") as string | null;
  const confirmPassword = formData.get("confirmPassword") as string | null;

  if (!password || !confirmPassword) {
    return redirectTo(request, "/update-password?error=missing");
  }

  if (password !== confirmPassword) {
    return redirectTo(request, "/update-password?error=mismatch");
  }

  if (password.length < 8) {
    return redirectTo(request, "/update-password?error=password");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectTo(request, "/update-password?error=session");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("[auth.updatePassword] Password update failed", {
      userId: user.id,
      error: {
        message: error.message,
        status: error.status,
        name: error.name,
      },
    });

    return redirectTo(request, "/update-password?error=failed");
  }

  await supabase.auth.signOut();

  return redirectTo(request, "/login?message=password_updated");
}
