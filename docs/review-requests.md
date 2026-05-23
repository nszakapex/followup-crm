# Review Request Lifecycle

Phase 7C hardens review request delivery status so every attempt has a clear outcome.

## Statuses

Review request status:

- `pending`: request record exists, but live delivery has not completed.
- `sent`: provider delivery completed.
- `clicked`: tracked review link was opened.
- `completed`: review flow completed where supported.
- `blocked`: the app intentionally did not call a provider because setup, contact data, opt-out, or readiness was missing.
- `failed`: a provider/helper attempt failed after the request was created.
- `duplicate_prevented`: the app refused a matching recent request.
- `canceled`: reserved for future manual cancellation.

Send status:

- `not_attempted`: no provider send was attempted, usually because test/skip delivery is active.
- `blocked`: pre-send checks blocked delivery.
- `sent`: provider delivery completed.
- `failed`: provider/helper delivery failed.
- `duplicate_prevented`: duplicate policy stopped the attempt.

## Blocked vs Failed

Blocked means no SMS or email provider call was made. Common blocked reasons:

- Google review link is missing.
- SMS provider is not configured.
- Email provider is not configured.
- Customer phone or email is missing for the requested channel.
- The customer opted out of SMS review requests.

Failed means the app attempted the delivery helper and it returned a failure. Provider secrets and raw provider payloads are not shown in the UI or stored in audit logs.

## Duplicate Prevention

The app prevents another review request to the same business, lead, channel, and contact method within the recent duplicate window. The dedupe key is business-scoped and does not cross businesses.

Duplicate-prevented attempts are audited with `review_request.duplicate_prevented`. They do not send provider messages.

## Send Paths

Direct review requests and manual automation action approval both use the hardened review request lifecycle.

Automation runs and scheduled runs still only create pending automation actions. They do not send SMS, email, or review requests.

Manual automation approval remains one action at a time. There is no send-all or bulk-send behavior.

## Audit Events

Review request audit events:

- `review_request.created`
- `review_request.sent`
- `review_request.blocked`
- `review_request.failed`
- `review_request.duplicate_prevented`

Automation action send audit events:

- `automation_action.send_requested`
- `automation_action.sent`
- `automation_action.send_blocked`
- `automation_action.send_failed`

Audit metadata includes safe identifiers and statuses only: business id, lead id, review request id, automation action id, channel, provider name, outcome, and sanitized reason. It must not include auth headers, automation secrets, provider credentials, webhook secrets, or raw provider payloads.

## Lead Timeline

`/leads/[id]` shows lifecycle events for:

- review request created
- review request sent
- review request blocked
- review request failed
- duplicate prevented
- review link clicked
- automation action sent, blocked, or failed

Review history shows status, send status, source, timestamps, and safe blocked/failed/duplicate reasons.

## Manual Smoke Tests

1. Missing Google review link:
   - send a review request
   - expected: blocked state, clear reason, no provider call

2. Missing provider readiness:
   - disable test/skip mode and omit SMS or email provider config
   - expected: blocked state, clear provider readiness reason, no provider call

3. Test/skip delivery:
   - enable `REVIEW_REQUEST_SKIP_DELIVERY=true` or `REVIEW_REQUEST_TEST_MODE=true`
   - expected: request record created, `send_status = not_attempted`, no Twilio or Resend call

4. Duplicate direct request:
   - send a matching request twice within the duplicate window
   - expected: second attempt is duplicate-prevented and audited

5. Automation action approval:
   - approve one pending `review_request` automation action
   - expected: review request created/linked, action updates to sent/skipped/blocked/failed, no bulk send

6. Blocked automation action:
   - approve an action when provider readiness is missing
   - expected: action and review request show blocked reason, no provider call

7. Lead detail:
   - open `/leads/[id]`
   - expected: review history and timeline show lifecycle events clearly

## Migration

Apply:

```text
supabase/migrations/007_phase_7c_review_request_lifecycle.sql
```

The migration is additive. It adds lifecycle columns, status enum values, indexes, and an updated-at trigger for `review_requests`.
