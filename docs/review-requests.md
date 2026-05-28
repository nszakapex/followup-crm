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
- SMS A2P compliance is not approved.
- Email provider is not configured.
- Customer phone or email is missing for the requested channel.
- The customer opted out of SMS review requests.

Failed means the app attempted the delivery helper and it returned a failure. UI and persisted failure reasons are sanitized. Raw provider details may be logged server-side for debugging, but provider secrets, auth headers, raw provider payloads, and stack traces are not returned to the browser or stored as user-facing reasons.

## Duplicate Prevention

The app prevents another review request to the same business, lead/contact, channel, and destination identity within the recent duplicate window. The dedupe key is business-scoped and includes the normalized destination, so a request to a different destination is not blocked by an earlier destination-specific request.

Duplicate-prevented attempts are audited with `review_request.duplicate_prevented`. They do not send provider messages.

Preflight duplicate checks use the same dedupe-key identity, but final send remains authoritative. If preflight misses a recent duplicate, `sendReviewRequest` still records `duplicate_prevented` before any provider call.

Test/skip outcomes also count for duplicate prevention inside the duplicate
window. A request recorded with `send_status = not_attempted` or `skipped`
prevents repeated clicks from creating unlimited additional skipped rows for
the same business, lead/contact, channel, and destination identity.

Phase 9 keeps review request send dedupe separate from automation action
dedupe. An automation action may be skipped before queueing when a recent
matching review request already exists, and final `sendReviewRequest` still
re-checks review request dedupe before any provider path can run.

Phase 10 allows review request body templates to come from the selected
business workflow type. Unknown or unset business types use the generic service
business wording. `auto_detailing` can provide detailing-specific review
request copy for beta/demo businesses, but the send lifecycle, duplicate
prevention, provider readiness, and manual confirmation rules are unchanged.

## Send Paths

Direct review requests and manual automation action approval both use the hardened review request lifecycle.

Automation runs and scheduled runs still only create pending automation actions. They do not send SMS, email, or review requests.

Manual automation approval remains one action at a time. There is no send-all or bulk-send behavior.

## Audit Events

Review request audit events:

- `review_request.created`
- `review_request.provider_attempted`
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

## Phase 7D Operator Visibility

Phase 7D centralizes lifecycle display and retry eligibility logic. The app maps raw `status` and `send_status` values into an operator-facing model:

- lifecycle label
- attention level
- explanation
- whether anything was sent
- safe reason
- next operator action
- priority timestamp

Surfaces that use this model:

- `/reviews`
- `/leads/[id]`
- lead detail activity timeline
- review request history

### Needs Attention

The `/reviews` page highlights blocked, failed, duplicate-prevented, and test-skipped request outcomes.

Examples:

- Blocked: no provider message was sent because setup, contact, opt-out, or provider readiness stopped delivery.
- Failed: provider/helper delivery failed after the send path started.
- Duplicate prevented: no provider message was sent because a recent matching request already exists.
- Test delivery: live provider delivery was skipped by test/skip mode.

### Retry Eligibility

Retry eligibility is centralized, but Phase 7D does not add a retry send button.

Rules:

- sent requests are not retryable by default
- clicked/completed requests are not retryable
- duplicate-prevented requests are not retried by default
- skipped/not-attempted requests are not failures
- blocked requests require the blocked setup/contact issue to be fixed
- failed requests require provider readiness and must still pass duplicate prevention
- any future retry must be manual, one request at a time, server-side, and must re-run provider readiness and duplicate checks

Current UI copy directs operators to create a new manual request after fixing setup instead of retrying in place. This avoids overwriting lifecycle history or adding an unsafe retry path without a linked retry-attempt model.

Phase 7D still does not add automatic sending, cron sending, send-all behavior, bulk messaging, browser secret exposure, or provider credential exposure.

## Phase 7E Manual Send Preflight

Phase 7E is the final Phase 7 hardening pass. It adds server-side provider readiness and manual-send preflight checks before an operator submits a manual review request or manually approves a pending automation action.

Preflight checks are read-only. They do not send messages, create review requests, mutate automation actions, call Twilio, call Resend, or bypass duplicate prevention.

Preflight evaluates:

- business scope
- customer/lead scope
- selected channel
- destination availability
- SMS opt-out state
- Google review link setup
- provider readiness
- current send mode: live, test, skip, or blocked
- duplicate-prevention risk
- automation action ownership when approving a queued action

Provider readiness is server-side only. The UI receives safe labels, booleans, warnings, and reasons. It never receives provider secrets, API keys, auth tokens, or raw environment variable values.

### Live Confirmation

Live manual sends require explicit operator confirmation.

Live confirmation copy states:

- this will attempt a real provider message
- selected channel
- safe destination summary
- provider label
- business context
- duplicate-prevention status
- the action is manual and recorded in review request history

Test and skip modes do not imply a live send. Their button and explanation copy state that no live provider message will be sent.

### Retry Remains Deferred

Manual retry sending remains deferred. Phase 7E does not add a retry button because safe retry should preserve attempt lineage, such as `previous_review_request_id` or an attempt-history table. A future Phase 8+ retry model must create new linked attempts or otherwise preserve lifecycle history without overwriting prior blocked/failed outcomes.

### Safety Boundaries

Phase 7E does not add:

- automatic sending
- cron provider sending
- scheduled provider sending
- send-all behavior
- bulk messaging
- batch review sends
- browser-side provider calls
- provider secret exposure

The protected automation runner and scheduler still reject provider sends.

## Phase 8 Controlled Manual Provider Validation

Phase 8 validates one controlled manual provider send path. It does not add
automation delivery, cron delivery, scheduled provider sends, bulk sends,
send-all, batch review sends, or retry sending.

The validated path is:

1. Operator opens the direct manual review request flow.
2. Server-side preflight checks business scope, lead scope, destination, review
   link, provider readiness, send mode, and duplicate risk.
3. Live mode requires explicit confirmation before submit.
4. The server action re-checks auth/business scope and calls
   `sendReviewRequest`.
5. `sendReviewRequest` records the request lifecycle, checks duplicates, and
   delegates provider delivery through the server-only review provider adapter.
6. The adapter delegates to the existing SMS or email helper.
7. The final lifecycle is written to `review_requests` and shown in `/reviews`
   and `/leads/[id]`.

Provider metadata is normalized into safe fields such as provider name,
provider message id, and provider status. Raw credentials, auth headers, API
keys, and unsafe provider payloads are never returned to the browser.

### Provider Outcomes

- Live success records `status = sent`, `send_status = sent`, `sent_at`, and
  safe provider metadata when available.
- Provider readiness/configuration blocks record `blocked` and do not call the
  provider.
- Provider/helper failures record `failed` after the send path starts.
- Duplicate attempts record `duplicate_prevented` and do not call the provider.
- Test/skip mode records `not_attempted` and does not call the provider.
- Repeating the same test/skip request inside the duplicate window records or
  resolves as already processed instead of creating another skipped request.

Failure reasons shown to operators and stored on review request lifecycle fields are safe summaries only, such as `SMS delivery failed.` or `Email delivery failed.`. Raw provider diagnostics remain server-side only.

### Phase 8A Pre-Provider Validation

Phase 8A must pass before configuring Resend, Twilio, or another live provider
for controlled validation.

Duplicate prevention uses the same destination-aware identity in preflight and
final send:

```text
business + lead/contact/customer + channel + normalized destination
```

The final `sendReviewRequest` check is authoritative. Preflight can warn or
block when it sees a duplicate, but final send still checks the dedupe key
before any provider call and records `duplicate_prevented` when needed.

Provider/helper failures are sanitized before they are stored on
`review_requests` or returned to UI. Server logs may contain safe debugging
context, but raw provider details, auth headers, tokens, API keys, stack
traces, and raw provider response bodies are not user-facing lifecycle text.

### Safe Validation Checklist

1. Apply `supabase/migrations/007_phase_7c_review_request_lifecycle.sql`.
2. Confirm test/skip mode first.
3. Confirm missing provider configuration blocks safely.
4. Confirm missing review link blocks safely.
5. Confirm missing phone/email blocks safely.
6. Configure exactly one provider/channel intentionally.
7. Use one test lead/contact.
8. Confirm the UI says live mode is ready.
9. Confirm the live send checkbox/confirmation is shown.
10. Submit one manual request.
11. Verify `/reviews` and `/leads/[id]` show the final lifecycle.
12. Attempt the same request again and confirm duplicate prevention.

### Supabase Verification Query

```sql
select
  id,
  business_id,
  lead_id,
  status,
  send_status,
  source,
  channel,
  provider,
  provider_message_id,
  provider_response_json,
  sent_at,
  blocked_at,
  failed_at,
  duplicate_prevented_at,
  blocked_reason,
  failure_reason,
  duplicate_reason,
  automation_action_id,
  created_at
from review_requests
order by created_at desc
limit 20;
```

This query is read-only and does not expose provider secrets.

## Phase 11 Diagnostics

Phase 11 adds read-only beta readiness and data integrity diagnostics. Review
request behavior is unchanged: manual sends still use server-side readiness,
preflight, duplicate prevention, lifecycle persistence, and confirmation when
live mode is active.

Diagnostics check that review request lifecycle rows are coherent:

- `sent` rows should have `sent_at`
- `blocked` rows should have `blocked_at` and a safe reason
- `failed` rows should have `failed_at` and a safe reason
- `duplicate_prevented` rows should have `duplicate_prevented_at` and a safe reason
- provider metadata should be safe and should not contain secret-like values
- duplicate request identities should be visible before beta use

These checks never call providers, never mutate rows, and never expose raw
provider credentials or raw provider payloads.

## Phase 12 Pilot Hardening

Phase 12 keeps review delivery manual and owner-safe. Password reset, admin
guarding, environment readiness, pilot billing clarity, and webhook ingestion
documentation were hardened around the existing review request lifecycle.

Review request behavior is unchanged:

- test/skip mode records no live provider message
- blocked means no provider call occurred
- duplicate prevention remains server-side and destination-aware
- live sends still require an explicit manual action and confirmation
- automation and scheduled routes still cannot send provider messages

## Phase 13 Controlled Channel Validation

For concierge pilot validation, test exactly one provider/channel at a time.
Start with test/skip mode, then blocked-provider behavior, then one intentional
live channel only when the operator controls the destination. See
[concierge-pilot.md](./concierge-pilot.md) for the full manual checklist.

## Phase 14 One-Channel Field Test

Phase 14 uses the existing server-only provider adapter and selects Resend email
as the first live validation channel. No second provider is added.

Required server env for the email field test:

```text
RESEND_API_KEY=
RESEND_FROM_EMAIL=
REVIEW_REQUEST_TEST_MODE=false
REVIEW_REQUEST_SKIP_DELIVERY=false
```

Only use an operator-owned test email destination. The live path is:

1. Open one lead with a valid email destination.
2. Confirm the business has a Google review link.
3. Confirm setup/settings show email live readiness.
4. Submit one direct manual review request after confirmation.
5. Verify `review_requests` and the lead timeline show `sent` or a safe
   `failed` outcome.
6. Submit the same request again and verify `duplicate_prevented`.

Missing email provider configuration must block before any provider call.
Test/skip mode must record `not_attempted` or skipped behavior without calling
Resend. Automation run and scheduled-run routes still reject provider-send
requests and cannot perform this field test.

## Phase 16 SMS Compliance Gate

Phase 16 adds a live-SMS compliance gate before Twilio can be called. The SMS
send path now requires Twilio configuration plus explicit A2P approval through
`SMS_COMPLIANCE_APPROVED=true`, `TWILIO_A2P_CAMPAIGN_STATUS=approved`, or an
approved business SMS compliance status.

If approval is missing, SMS review requests are `blocked` with a safe reason and
no Twilio request is made. If test/skip mode is active, no Twilio request is
made. If the lead is opted out, no Twilio request is made.

Inbound Twilio replies are accepted at `/api/webhooks/twilio/sms`, stored as
matched inbound `messages`, and shown on the lead timeline. STOP-style replies
mark the lead opted out; HELP and normal replies mark the lead as needing
operator attention where applicable.

See [sms-compliance.md](./sms-compliance.md) for setup and testing.
