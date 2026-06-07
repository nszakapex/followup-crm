# SMS Provider Architecture, Compliance, and Inbound Replies

Phase 16 added SMS compliance gates and inbound reply storage. This follow-up
refactor makes outbound SMS provider-neutral. It does not add automatic SMS
sending, instant missed-call textback automation, cron provider sending, bulk
messaging, retry sending, or send-all behavior.

## Provider Selection

Outbound SMS uses the adapter boundary under `src/lib/sms`.

Supported provider names:

- `SMS_PROVIDER=mock`: safe local/test default. Records mock SMS attempts and
  never calls a carrier.
- `SMS_PROVIDER=twilio`: optional legacy adapter only.
- `SMS_PROVIDER=telnyx`: reserved for a future adapter. It fails closed today.
- `SMS_PROVIDER=plivo`: reserved for a future adapter. It fails closed today.

If `SMS_PROVIDER` is omitted in local/test mode, the app uses `mock`. Core app
routes, review request logic, automation logic, dashboard pages, and setup
readiness do not require Twilio to function.

## Live SMS Gate

Live SMS is blocked until all of these are true:

- `SMS_PROVIDER` selects a real implemented provider
- provider credentials are configured server-side
- provider sender configuration exists
- SMS compliance approval is explicitly recorded with
  `SMS_COMPLIANCE_APPROVED=true`, `SMS_COMPLIANCE_STATUS=approved`, a legacy
  `TWILIO_A2P_CAMPAIGN_STATUS=approved`, or the business SMS compliance status
  is `approved`
- the lead has a valid phone destination
- the lead is not opted out
- review delivery is not in test/skip mode
- the operator manually submits one send action and confirms live mode

Secret values are never shown in setup/settings/readiness UI.

## Environment Variables

```text
SMS_PROVIDER=mock
SMS_COMPLIANCE_APPROVED=false
SMS_COMPLIANCE_STATUS=

# Optional legacy Twilio adapter. Required only when SMS_PROVIDER=twilio.
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_FROM_NUMBER=
TWILIO_PHONE_NUMBER=
TWILIO_A2P_CAMPAIGN_STATUS=
TWILIO_WEBHOOK_VALIDATE_SIGNATURE=false
```

Keep `SMS_PROVIDER=mock`, `SMS_COMPLIANCE_APPROVED=false`, and
`REVIEW_REQUEST_TEST_MODE=true` or `REVIEW_REQUEST_SKIP_DELIVERY=true` for
local/demo work.

## Legacy Twilio Inbound SMS Webhook

Twilio inbound handling remains available as an isolated legacy route:

```text
POST https://YOUR_DOMAIN/api/webhooks/twilio/sms
```

This route is not required for `SMS_PROVIDER=mock`. It accepts Twilio form
payloads with:

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

When `TWILIO_AUTH_TOKEN` and `X-Twilio-Signature` are present, the legacy Twilio
webhook validates the signature. In production, missing signature validation
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
- `provider = twilio` for the legacy Twilio inbound route
- `provider_message_id = MessageSid`
- `received_at` is recorded

They appear on:

- `/messages`
- `/leads/[id]` timeline
- `/leads/[id]` messages and notes section
- `/leads/[id]` reply banner when a recent inbound SMS exists

## Manual Test Before Any Live SMS Provider

1. Keep `SMS_PROVIDER=mock`.
2. Keep `REVIEW_REQUEST_TEST_MODE=true` or `REVIEW_REQUEST_SKIP_DELIVERY=true`.
3. Create a lead with an operator-owned phone number.
4. Trigger one manual SMS review/follow-up action.
5. Confirm a `messages` row records `provider = mock` or `provider = test_mode`.
6. Confirm no carrier/provider request was made.
7. Attempt the same action again and confirm duplicate/repeat-click protection.

## Legacy Twilio Manual Test After Approval

1. Apply `supabase/migrations/008_phase_16_sms_compliance_inbound.sql`.
2. Set `SMS_PROVIDER=twilio`.
3. Configure Twilio env vars server-side.
4. Set the business `twilio_from_number` to the Twilio number used for inbound
   replies.
5. Configure Twilio inbound webhook URL.
6. Keep live sends blocked until compliance approval is confirmed.
7. Set `SMS_COMPLIANCE_APPROVED=true` only after approval.
8. Send `HELP` from an operator-owned phone to the Twilio number.
9. Confirm the lead is marked `needs_reply` and the message appears in the CRM.
10. Send `STOP` from the same operator-owned phone.
11. Confirm the lead is marked `opted_out=true`.
12. Attempt one manual SMS action only after approval.
13. Confirm opted-out leads are blocked and no SMS is sent.

Do not use automation routes for live SMS testing. They still reject
`allowProviderSends:true` and cannot send provider messages.
