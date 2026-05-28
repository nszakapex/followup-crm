# SMS Compliance and Inbound Replies

Phase 16 adds SMS compliance gates and inbound reply storage. It does not add
automatic SMS sending, instant missed-call textback automation, cron provider
sending, bulk messaging, retry sending, or send-all behavior.

## Live SMS Gate

Live Twilio SMS is blocked until all of these are true:

- `TWILIO_ACCOUNT_SID` is configured server-side
- `TWILIO_AUTH_TOKEN` is configured server-side
- `TWILIO_MESSAGING_SERVICE_SID` or a sender number is configured
- A2P approval is explicitly recorded with `SMS_COMPLIANCE_APPROVED=true`,
  `TWILIO_A2P_CAMPAIGN_STATUS=approved`, or the business SMS compliance status
  is `approved`
- the lead has a valid phone destination
- the lead is not opted out
- review delivery is not in test/skip mode
- the operator manually submits one send action and confirms live mode

Secret values are never shown in setup/settings/readiness UI.

## Environment Variables

```text
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_FROM_NUMBER=
TWILIO_PHONE_NUMBER=
SMS_COMPLIANCE_APPROVED=false
TWILIO_A2P_CAMPAIGN_STATUS=
TWILIO_WEBHOOK_VALIDATE_SIGNATURE=false
```

Keep `SMS_COMPLIANCE_APPROVED=false` until Twilio A2P 10DLC approval is
confirmed. Keep `REVIEW_REQUEST_TEST_MODE=true` or
`REVIEW_REQUEST_SKIP_DELIVERY=true` for local/demo work.

## Inbound SMS Webhook

Configure Twilio inbound messaging to:

```text
POST https://YOUR_DOMAIN/api/webhooks/twilio/sms
```

The route accepts Twilio form payloads with:

- `From`
- `To`
- `Body`
- `MessageSid`

The `To` number must match `businesses.twilio_from_number`. If no business
matches the inbound number, the webhook returns an empty TwiML response and does
not expose the message to other businesses.

The `From` number is matched to leads in that business by normalized phone
number. If no lead matches, the message is not stored in the business timeline.

## Signature Validation

When `TWILIO_AUTH_TOKEN` and `X-Twilio-Signature` are present, the webhook
validates the Twilio signature. In production, missing signature validation
returns `403`.

For local testing without Twilio, signature validation may be skipped in
development. Set `TWILIO_WEBHOOK_VALIDATE_SIGNATURE=true` to require it locally.

## STOP and HELP

STOP keywords:

```text
STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT
```

When a matched lead sends one of these:

- the inbound message is stored
- the lead is marked `opted_out=true`
- future SMS sends are blocked by the existing send path
- the webhook returns a short opt-out confirmation

HELP keywords:

```text
HELP, INFO
```

When a matched lead sends HELP:

- the inbound message is stored
- the lead is marked `needs_reply`
- the webhook returns a short support/help response using public business
  contact information

Normal replies are stored and mark the lead as `needs_reply`.

## Where Replies Appear

Matched inbound SMS replies are stored in the existing `messages` table:

- `channel = sms`
- `direction = inbound`
- `status = received`
- `provider = twilio`
- `provider_message_id = MessageSid`
- `received_at` is recorded

They appear on:

- `/messages`
- `/leads/[id]` timeline
- `/leads/[id]` messages and notes section
- `/leads/[id]` reply banner when a recent inbound SMS exists

## Manual Test After A2P Approval

1. Apply `supabase/migrations/008_phase_16_sms_compliance_inbound.sql`.
2. Set the business `twilio_from_number` to the Twilio number used for inbound
   replies.
3. Configure Twilio inbound webhook URL.
4. Keep live sends blocked until A2P approval is confirmed.
5. Send `HELP` from an operator-owned phone to the Twilio number.
6. Confirm the lead is marked `needs_reply` and the message appears in the CRM.
7. Send `STOP` from the same operator-owned phone.
8. Confirm the lead is marked `opted_out=true`.
9. Attempt one manual SMS action only after approval.
10. Confirm opted-out leads are blocked and no SMS is sent.

Do not use automation routes for live SMS testing. They still reject
`allowProviderSends:true` and cannot send provider messages.
