import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function textResponse(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function databaseErrorResponse(action: string, message: string) {
  return textResponse(
    isDevelopment() ? `${action}: ${message}` : action,
    500
  );
}

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

  if (!token) {
    return textResponse("Review request not found.", 404);
  }

  const supabase = createAdminClient();

  const { data: reviewRequest, error: reviewRequestError } = await supabase
    .from("review_requests")
    .select("id, business_id")
    .eq("click_token", token)
    .maybeSingle();

  if (reviewRequestError) {
    return databaseErrorResponse(
      "Review request lookup failed.",
      reviewRequestError.message
    );
  }

  if (!reviewRequest) {
    return textResponse("Review request not found.", 404);
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("google_review_link")
    .eq("id", reviewRequest.business_id)
    .maybeSingle();

  if (businessError) {
    return databaseErrorResponse(
      "Review link lookup failed.",
      businessError.message
    );
  }

  const fallback = new URL("/", request.url).toString();
  const redirectUrl = safeRedirectUrl(business?.google_review_link, fallback);

  if (!business?.google_review_link || redirectUrl === fallback) {
    return textResponse("Review link is not configured.", 400);
  }

  const clickedAt = new Date().toISOString();

  const { error: clickedStatusError } = await supabase
    .from("review_requests")
    .update({
      clicked_at: clickedAt,
      status: "clicked",
    })
    .eq("id", reviewRequest.id);

  if (clickedStatusError) {
    const { error: clickedAtError } = await supabase
      .from("review_requests")
      .update({ clicked_at: clickedAt })
      .eq("id", reviewRequest.id);

    if (clickedAtError) {
      return databaseErrorResponse(
        "Review click tracking failed.",
        clickedAtError.message
      );
    }
  }

  return NextResponse.redirect(redirectUrl);
}
