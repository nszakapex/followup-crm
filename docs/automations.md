# Automation Runner

Phase 6 adds a controlled automation runner foundation. It does not schedule itself and does not call SMS or email providers.

## Command

Dry-run:

```bash
npm run automations:run -- --business-id=<uuid> --dry-run
```

Confirmed run:

```bash
npm run automations:run -- --business-id=<uuid> --confirm-run
```

Optional flags:

```bash
--limit=50
--allow-provider-sends
```

`--allow-provider-sends` is accepted for future compatibility, but the Phase 6 runner still does not call Twilio or Resend. Confirmed runs create internal/test records only.

## Safety Rules

- Defaults to dry-run.
- Requires `--business-id`.
- Refuses malformed business ids.
- Does not run across all businesses.
- Does not run automatically on page load.
- Does not call `sendSms`, `sendEmail`, or `sendReviewRequest`.
- Does not call Twilio or Resend.
- Respects customer opt-out and missing contact data.
- Uses `audit_logs.metadata_json.action_key` to prevent duplicate automation actions.

## Current Automation Behavior

Lead message automations evaluate eligible leads and can create pending automation action records in confirmed mode:

- `instant_lead_reply`
- `twenty_four_hour_followup`
- `three_day_followup`
- `missed_call_textback`

Review request automation evaluates completed leads and can create a pending review request action:

- `review_request`

Owner summary is intentionally evaluation-only in this phase:

- `weekly_owner_summary`

## Duplicate Prevention

The runner builds a stable action key:

```text
automation:<automationType>:lead:<leadId>
```

Before creating any action, it checks `audit_logs` for an existing `automation.action_created` event containing that `action_key`.

## Counters

Confirmed actions update:

- `automations.last_triggered_at`
- `automations.trigger_count`

Dry-runs, skipped actions, duplicate skips, and failed actions do not increment counters.

## API Trigger

Phase 6B adds a secure API trigger for server-side or future scheduler use:

```text
POST /api/automations/run
```

The route is single-business only. It requires `businessId` and never runs across all businesses.

Authentication uses a server-only secret:

```bash
Authorization: Bearer <AUTOMATION_RUN_SECRET>
```

or:

```bash
x-automation-secret: <AUTOMATION_RUN_SECRET>
```

`CRON_SECRET` is also accepted as a fallback if `AUTOMATION_RUN_SECRET` is not set. Do not prefix either value with `NEXT_PUBLIC_`.

Dry-run request:

```bash
curl -X POST "https://your-app.example.com/api/automations/run" \
  -H "Authorization: Bearer <AUTOMATION_RUN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "<uuid>",
    "dryRun": true,
    "limit": 50
  }'
```

Confirmed internal/test execution:

```bash
curl -X POST "https://your-app.example.com/api/automations/run" \
  -H "Authorization: Bearer <AUTOMATION_RUN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "<uuid>",
    "dryRun": false,
    "confirmRun": true,
    "limit": 50
  }'
```

Confirmed execution still does not call Twilio or Resend. It creates pending automation actions for review.

Provider sends are disabled from the API route. Requests with `allowProviderSends: true` are rejected with:

```text
Provider sends are not enabled for scheduled automation runs.
```

## Future Cron Guidance

The API route is ready for a future scheduler or Vercel Cron-style caller, but this repo does not add an active cron schedule in Phase 6B.

Future cron calls should:

- call `POST /api/automations/run`
- include `Authorization: Bearer <AUTOMATION_RUN_SECRET>`
- pass a single `businessId`
- default to dry-run until confirmed in production
- keep provider sends disabled

All-business scheduled execution is intentionally deferred.

## Phase 6C Visibility

Phase 6C records automation run summaries in `audit_logs` and shows the latest run on the Automations page.

Completed route runs write:

```text
automation_run.completed
```

Failed authorized run attempts that are scoped to a valid business id write:

```text
automation_run.failed
```

The audit payload includes:

- `businessId`
- `dryRun`
- `confirmRun`
- `evaluated`
- `eligible`
- `actionsCreated`
- `skipped`
- `failures`
- `duplicatesPrevented`
- `providerSendsAllowed`
- `providerSendsBlocked`
- `allowProviderSendsRequested`
- `source`
- `route`
- `completedAt`
- `durationMs`
- `requestMode`
- `reason`
- `error`

Secrets, authorization headers, webhook secrets, provider credentials, and raw customer data are never written to the run summary.

The Automations page reads the latest five run summaries for the signed-in business through normal server-side Supabase/RLS access. It does not call `/api/automations/run`, does not receive any automation secret, and cannot trigger scheduled execution from the browser.

## Route Smoke Tests

No secret:

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{}'
```

Expected:

```json
{"success":false,"error":"Automation run secret is invalid."}
```

Invalid secret:

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer wrong-secret" } `
  -ContentType "application/json" `
  -Body '{"businessId":"BUSINESS_ID","dryRun":true}'
```

Expected: `401 Unauthorized`.

Missing business id:

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"dryRun":true}'
```

Expected: `400 Bad Request`.

Dry-run:

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"businessId":"BUSINESS_ID","dryRun":true}'
```

Expected:

- `200 OK`
- `success: true`
- `dryRun: true`
- `requestMode: "dry_run"`
- `actionsCreated: 0`
- `providerSendsAllowed: false`
- `providerSendsBlocked: true`

Confirmed execution requires:

```json
{
  "businessId": "BUSINESS_ID",
  "dryRun": false,
  "confirmRun": true
}
```

If `dryRun` is false without `confirmRun: true`, the route returns `400 Bad Request`.

Provider sends remain blocked:

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"businessId":"BUSINESS_ID","dryRun":true,"allowProviderSends":true}'
```

Expected:

```text
Provider sends are not enabled for scheduled automation runs.
```

## Build Verification

Run:

```bash
npm run build
```

The route list should include:

```text
ƒ /api/automations/run
```

## Production Cron Readiness

Use a server-side scheduler only. Do not call the route from browser code.

Generic cron request:

```http
POST https://YOUR_DOMAIN/api/automations/run
Authorization: Bearer $AUTOMATION_RUN_SECRET
Content-Type: application/json

{
  "businessId": "BUSINESS_ID",
  "dryRun": true
}
```

Confirmed internal execution:

```http
POST https://YOUR_DOMAIN/api/automations/run
Authorization: Bearer $AUTOMATION_RUN_SECRET
Content-Type: application/json

{
  "businessId": "BUSINESS_ID",
  "dryRun": false,
  "confirmRun": true
}
```

Current limitations remain intentional:

- Single-business only.
- No all-business scheduled execution.
- No live Twilio or Resend delivery.
- No browser-visible run trigger.
- Provider sends are rejected even if `allowProviderSends` is requested.

## Phase 6D Pending Action Review Queue

Phase 6D adds a business-scoped `automation_actions` review queue.

Dry-runs still only evaluate candidates:

- no `automation_actions` rows are created
- no messages are created
- no review requests are created
- no SMS or email is sent
- `actionsCreated` stays `0`

Confirmed runs require:

```json
{
  "businessId": "BUSINESS_ID",
  "dryRun": false,
  "confirmRun": true
}
```

Confirmed runs create `pending_review` automation actions when eligible candidates exist. These are operator-review records only. They do not send SMS, email, or review requests.

Each pending action includes:

- business scope
- linked lead when available
- action type
- suggested channel
- title and summary
- reason and reason code
- suggested message preview
- dedupe key
- safe metadata about the automation and candidate

Do not store secrets, auth headers, provider credentials, or raw customer payloads in action metadata.

### Duplicate Prevention

The runner creates a stable dedupe key:

```text
automation:<automationType>:lead:<leadId>
```

`automation_actions` has a partial unique index for active action keys:

```text
business_id + dedupe_key where status in ('pending_review', 'approved_pending_send', 'sent')
```

Running the same confirmed automation twice should skip duplicate active pending actions and increase `duplicatesPrevented`. Sent actions also keep the same automation/customer/reason combination from immediately creating another pending card.

Reviewed or dismissed actions are no longer active pending actions, so a future confirmed run may create a fresh reviewable action for the same lead/automation if that is still eligible.

### Automations Page

Open:

```text
http://localhost:3000/automations
```

The page shows:

- automation run status
- recent run history
- pending automation actions
- recently reviewed/dismissed actions

Pending actions can be:

- approved and sent one at a time
- marked reviewed
- dismissed

`Mark reviewed` and `Dismiss` never send anything to a customer. `Approve & send` is a manual operator action for exactly one pending card.

### Phase 6D Smoke Tests

Dry-run does not create actions:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"businessId":"BUSINESS_ID","dryRun":true}'
```

Expected:

- `200`
- `actionsCreated: 0`
- pending action count unchanged

Confirmed run creates pending actions:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"businessId":"BUSINESS_ID","dryRun":false,"confirmRun":true}'
```

Expected:

- `200`
- `actionsCreated >= 0`
- pending actions appear on `/automations` when eligible candidates exist
- no provider sends

Repeat confirmed run:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"businessId":"BUSINESS_ID","dryRun":false,"confirmRun":true}'
```

Expected:

- duplicate active pending actions are skipped
- `duplicatesPrevented` increases when the same candidates are still pending
- no duplicate pending action cards

Provider sends remain blocked:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"businessId":"BUSINESS_ID","dryRun":true,"allowProviderSends":true}'
```

Expected:

- `400`
- no provider send occurs

Review actions:

- click `Mark reviewed` on a pending action
- expected: the action leaves the pending queue or changes status, and no provider send occurs

Dismiss actions:

- click `Dismiss` on a pending action
- expected: the action leaves the pending queue, and no provider send occurs

## Phase 6E Manual Approval to Controlled Provider Send

Phase 6E adds a manual send path for pending automation actions. It does not change the protected automation runner: `/api/automations/run` still cannot send through providers, cron still cannot send, and all-business execution is still intentionally deferred.

### Workflow

1. Run a dry-run to see candidates. This creates no actions.
2. Run a confirmed automation run. This creates `pending_review` automation actions only.
3. Open `/automations`.
4. Inspect one pending action.
5. Click `Approve & send` for that single action.
6. The server validates business scope, status, channel, lead, opt-out state, duplicate sent state, provider readiness, and message/review-link requirements.
7. The existing provider-safe path sends or skips delivery according to current environment/provider settings.

There is no `send all` control and no client-visible automation secret.

### Send Paths

Review request actions use the existing review request flow. That flow creates a `review_requests` row, uses the tracked review link, and then uses the existing SMS/email delivery helpers.

Follow-up message actions use the existing SMS/email delivery helpers directly with the queued suggested message.

Delivery helpers still obey:

- `REVIEW_REQUEST_TEST_MODE`
- `REVIEW_REQUEST_SKIP_DELIVERY`
- SMS provider readiness
- email provider readiness
- missing phone/email validation
- SMS opt-out validation

If local/test delivery is active, the action is marked processed with `send_status = 'skipped'`; no Twilio or Resend call is made.

### Statuses

Automation action statuses now include:

- `pending_review`
- `reviewed`
- `dismissed`
- `approved_pending_send`
- `sent`
- `send_failed`
- `blocked`

Send result fields:

- `sent_at`
- `send_status`
- `provider`
- `provider_message_id`
- `provider_response_json`
- `send_error`

Do not store provider credentials, auth headers, automation secrets, webhook secrets, or raw provider payloads in these fields.

### Audit Events

Manual send writes safe audit events:

- `automation_action.send_requested`
- `automation_action.sent`
- `automation_action.send_failed`
- `automation_action.send_blocked`

Audit metadata contains business/action/channel/status/provider summary fields only. It must not contain provider credentials, auth headers, customer secrets, or raw sensitive payloads.

### Phase 6E Smoke Tests

Pending action appears after confirmed run:

- run the Phase 6D confirmed-run command
- expected: `/automations` shows one pending action when eligible candidates exist

Send button appears only on pending action:

- open `/automations`
- expected: each sendable pending card has one `Approve & send` button
- expected: no `send all` button exists

Manual send:

- click `Approve & send` on one pending action
- expected: exactly one action is processed
- expected: action status becomes `sent`, `send_failed`, or `blocked`
- expected: local/test mode uses `send_status = 'skipped'` and no provider call occurs

Sent action cannot be sent again:

- refresh `/automations`
- expected: sent action is no longer in the pending queue
- expected: no second send button appears for that action

Dismissed/reviewed actions cannot be sent:

- click `Dismiss` or `Mark reviewed`
- expected: action leaves pending queue
- expected: no provider send occurs

Missing provider readiness:

- disable skip/test mode and omit provider credentials
- click `Approve & send`
- expected: action becomes blocked with a safe missing-provider error
- expected: no provider send occurs

Provider sends remain blocked from automation runner:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"businessId":"BUSINESS_ID","dryRun":true,"allowProviderSends":true}'
```

Expected:

- `400`
- no provider send occurs

## Phase 7C Review Request Delivery Reliability

Manual automation approval for `review_request` actions now uses the hardened review request lifecycle documented in `docs/review-requests.md`.

Possible outcomes:

- sent
- not attempted in test/skip mode
- blocked before provider delivery
- failed after provider/helper attempt
- duplicate prevented

Automation action send results are linked back to the created review request when available. Blocked, failed, and duplicate-prevented outcomes are visible on `/leads/[id]` in both the review history and activity timeline.

The automation runner and scheduler still do not send. They only create pending actions. Provider sends still require a logged-in operator clicking `Approve & send` on one pending action.

Phase 7D adds clearer lifecycle inspection after those manual sends. Blocked, failed, duplicate-prevented, and test-skipped review request outcomes are visible in `/reviews` and `/leads/[id]`.

Retry controls are not added to automation or cron flows. Any future retry must remain a manual operator action and must re-run provider readiness and duplicate-prevention checks.

## Phase 7E Manual Approval Preflight

Phase 7E adds preflight visibility before an operator manually approves a pending review-request action.

The preflight check is server-side and read-only. It checks business scope, lead scope, action ownership, channel, destination, review link, provider readiness, current delivery mode, and duplicate risk. It does not call providers and does not create records.

If the action is live-send ready, the operator must confirm the live send before the form submits. Scheduled automation routes still cannot send provider messages and still reject `allowProviderSends:true`.

Phase 8 keeps automation provider sends blocked. Controlled provider
validation is limited to one manual operator-approved send path. Automation
runs and scheduled runs continue to create pending review actions only.

## Phase 6F Production Cron Scheduling

Phase 6F adds a scheduler-oriented endpoint and business-level scheduling settings. The scheduler creates reviewable work only. It does not send SMS, email, or review requests.

### Routes

Single-business runner:

```text
POST /api/automations/run
```

Use this for targeted local testing or one known business.

Scheduler runner:

```text
POST /api/automations/scheduled-run
```

Use this from a server-side cron provider. It can run one supplied business id or, when no business id is supplied, eligible scheduled businesses up to a strict limit.

Both routes require:

```text
Authorization: Bearer $AUTOMATION_RUN_SECRET
```

or:

```text
x-automation-secret: $AUTOMATION_RUN_SECRET
```

`CRON_SECRET` is supported as a server-only fallback. Do not prefix these variables with `NEXT_PUBLIC_`.

### Business Scheduling

Business-level scheduling is stored in `automation_schedules`.

Safe defaults:

- `enabled = false`
- `frequency = manual_only`
- no business is scheduled automatically

Supported frequencies:

- `manual_only`
- `daily`
- `weekly`

The Automations page shows:

- schedule mode
- frequency
- timezone
- last scheduled run
- next scheduled run
- last scheduler status

Owners/managers can enable daily checks or pause the schedule from the Automations page. These controls only affect scheduler eligibility; they do not send messages.

### Scheduler Request Examples

Provider-neutral production dry-run:

```http
POST https://YOUR_DOMAIN/api/automations/scheduled-run
Authorization: Bearer $AUTOMATION_RUN_SECRET
Content-Type: application/json

{
  "dryRun": true,
  "limit": 10
}
```

Confirmed pending-action creation:

```http
POST https://YOUR_DOMAIN/api/automations/scheduled-run
Authorization: Bearer $AUTOMATION_RUN_SECRET
Content-Type: application/json

{
  "dryRun": false,
  "confirmRun": true,
  "limit": 10
}
```

Single-business targeted scheduled run:

```http
POST https://YOUR_DOMAIN/api/automations/scheduled-run
Authorization: Bearer $AUTOMATION_RUN_SECRET
Content-Type: application/json

{
  "businessId": "BUSINESS_ID",
  "dryRun": false,
  "confirmRun": true
}
```

### Scheduler Response

The scheduler returns a per-business summary:

```json
{
  "success": true,
  "dryRun": true,
  "scheduledRun": true,
  "businessesEvaluated": 3,
  "businessesRun": 3,
  "businessesFailed": 0,
  "totalEvaluated": 30,
  "totalEligible": 4,
  "totalActionsCreated": 0,
  "totalDuplicatesPrevented": 0,
  "providerSendsAllowed": false,
  "providerSendsBlocked": true,
  "results": []
}
```

### Safety Boundaries

- Dry-runs create no actions.
- Confirmed scheduled runs create pending `automation_actions` only.
- Cron never sends SMS.
- Cron never sends email.
- Cron never sends review requests.
- `/api/automations/scheduled-run` rejects `allowProviderSends:true`.
- Operators still approve and send one pending action manually.
- No browser code should call the scheduler endpoint with a secret.

### Audit Logging

Scheduler runs write business-scoped audit entries:

- `automation_scheduler.business_completed`
- `automation_scheduler.business_failed`

Metadata includes totals, dry-run/confirmed mode, route, duration, provider-send blocked status, and sanitized errors. It must not include secrets, headers, provider credentials, or customer payloads.

### Phase 6F Smoke Tests

Missing secret:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/scheduled-run" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{}'
```

Expected: `401`.

Invalid secret:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/scheduled-run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer wrong-secret" } `
  -ContentType "application/json" `
  -Body '{"dryRun":true}'
```

Expected: `401`.

Dry-run scheduled endpoint:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/scheduled-run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"dryRun":true,"limit":10}'
```

Expected:

- `200`
- `providerSendsAllowed:false`
- `providerSendsBlocked:true`
- `totalActionsCreated:0`

Confirmed scheduled run:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/scheduled-run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"dryRun":false,"confirmRun":true,"limit":10}'
```

Expected:

- `200`
- pending actions created only for eligible scheduled businesses/candidates
- no provider sends

Confirmed without `confirmRun`:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/scheduled-run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"dryRun":false}'
```

Expected: `400`.

Provider sends requested:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/scheduled-run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"dryRun":true,"allowProviderSends":true}'
```

Expected:

- `400`
- no provider send occurs

Limit enforcement:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/scheduled-run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"dryRun":true,"limit":999}'
```

Expected: `400`.

Dashboard check:

- open `/automations`
- confirm schedule readiness card appears
- confirm no browser cron trigger exists
- confirm pending queue and manual approve/send remain unchanged

## Phase 7A Readiness Link

Business setup and provider readiness now live at:

```text
/setup
```

Use this page to confirm business profile, Google review link, provider readiness, lead data, automation readiness, and lead capture status before running confirmed automation checks or manually approving sends.
