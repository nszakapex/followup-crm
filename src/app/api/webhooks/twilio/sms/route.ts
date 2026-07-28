import { handleTwilioInboundSms } from "@/lib/messaging/twilio-webhooks";

export const runtime = "nodejs";

// Twilio inbound SMS webhook ("A message comes in" on the Messaging Service).
// STOP-family -> consent revoked + phone-level suppression; START-family ->
// re-opt-in; HELP -> log (Twilio Advanced Opt-Out answers when enabled);
// anything else -> lead status needs_reply and the follow-up sequence stops.
// Handler logic lives in src/lib/messaging/twilio-webhooks.ts for testability.

export async function POST(request: Request) {
  return handleTwilioInboundSms(request);
}
