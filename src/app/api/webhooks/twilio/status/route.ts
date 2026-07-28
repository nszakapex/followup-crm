import { handleTwilioStatusCallback } from "@/lib/messaging/twilio-webhooks";

export const runtime = "nodejs";

// Twilio delivery-status callback (StatusCallback on outbound sends and/or
// the Messaging Service). Updates the matching messages row by MessageSid so
// the dashboard shows queued -> sent -> delivered/undelivered/failed plus the
// carrier error code. ErrorCode 21610 is recorded as a durable opt-out.

export async function POST(request: Request) {
  return handleTwilioStatusCallback(request);
}
