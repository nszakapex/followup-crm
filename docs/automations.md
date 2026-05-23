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

Lead message automations evaluate eligible leads and can create pending outbound message records in confirmed mode:

- `instant_lead_reply`
- `twenty_four_hour_followup`
- `three_day_followup`
- `missed_call_textback`

Review request automation evaluates completed leads and can create a pending review request record:

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

Confirmed execution still does not call Twilio or Resend. It creates only the same internal/test records that the manual runner creates.

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
