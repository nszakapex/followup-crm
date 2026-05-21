import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function safeRedirectUrl(url: string | null | undefined, fallback: string) {
  if (!url) return fallback;

  try {
    return new URL(url).toString();
  } catch {
    return fallback;
  }
}

export async function GET(
  request: Request,
  props: { params: Promise<{ token: string }> }
) {
  const { token } = await props.params;
  const fallback = new URL("/", request.url).toString();

  if (!token) {
    return NextResponse.redirect(fallback);
  }

  const supabase = createAdminClient();

  const { data: reviewRequest } = await supabase
    .from("review_requests")
    .select("id, business_id")
    .eq("click_token", token)
    .single();

  if (!reviewRequest) {
    return NextResponse.redirect(fallback);
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("google_review_link")
    .eq("id", reviewRequest.business_id)
    .single();

  const redirectUrl = safeRedirectUrl(business?.google_review_link, fallback);
  const clickedAt = new Date().toISOString();

  const { error: clickedStatusError } = await supabase
    .from("review_requests")
    .update({
      clicked_at: clickedAt,
      status: "clicked",
    })
    .eq("id", reviewRequest.id);

  if (clickedStatusError) {
    await supabase
      .from("review_requests")
      .update({ clicked_at: clickedAt })
      .eq("id", reviewRequest.id);
  }

  return NextResponse.redirect(redirectUrl);
}
