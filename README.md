# FollowUp CRM

FollowUp CRM is a local-service-business CRM for missed-call capture, lead
follow-up, review requests, and owner-facing follow-up visibility.

This repository is not a prospecting system. It does not include cold email,
scraping, mockup generation, ad audits, autonomous agents, or bulk outbound
campaigns.

## Current Pilot Scope

The app supports a controlled concierge pilot where setup can be helped by the
operator:

- Supabase auth, business profiles, and protected dashboard pages
- lead capture through a private webhook
- lead list/detail views and customer-style lead records
- review request lifecycle tracking
- manual review request sends through server-side readiness checks
- automation checks that create pending actions only
- one-at-a-time manual approval for pending actions
- setup/readiness and beta diagnostics
- demo/reset/verify scripts for safe testing

Provider sends are never automatic. Cron and scheduled automation routes cannot
send SMS, email, or review requests.

## Local Development

Install dependencies:

```powershell
npm install
```

Create `.env.local` from `env.example`, then start the app:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

For mobile LAN testing, run the dev server on the PC and open the LAN URL from
the phone. Supabase Auth redirect URLs must include localhost, the LAN origin,
and production callback/update-password URLs. See `docs/concierge-pilot.md`.

## Required Environment

Core Supabase variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Production app URL:

```text
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SITE_URL=
```

Automation endpoint secrets:

```text
AUTOMATION_RUN_SECRET=
CRON_SECRET=
```

Review delivery safety:

```text
REVIEW_REQUEST_TEST_MODE=true
REVIEW_REQUEST_SKIP_DELIVERY=true
```

Keep test/skip mode enabled for local and demo work. Set both values to `false`
only when intentionally validating one live provider/channel.

Optional provider variables:

```text
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_FROM_NUMBER=
TWILIO_PHONE_NUMBER=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

Do not prefix server secrets with `NEXT_PUBLIC_`.

## Supabase Setup

Apply migrations from `supabase/migrations` to the target Supabase project.

If the Supabase CLI is unavailable, use the Supabase SQL Editor and apply
migrations in order. Migration `007_phase_7c_review_request_lifecycle.sql` must
be applied before relying on review request lifecycle persistence in live data.

## Demo Data

Seed demo/beta data:

```powershell
npm run seed:demo
```

Reset demo/beta data:

```powershell
npm run reset:demo
```

Verify beta fixture/readiness without mutating data:

```powershell
npm run verify:beta -- --business-id=BUSINESS_ID
```

Demo data uses fake contacts only. Do not use real customer data in demo reset
or seed runs.

## Pilot Missed-Call Webhook

The initial missed-call ingestion path is a private lead-capture webhook:

```http
POST /api/webhooks/leads/[businessId]/[secret]
```

Example payload:

```json
{
  "fullName": "Sarah Miller",
  "phone": "5550101001",
  "email": "sarah@example.test",
  "source": "Missed call - pilot test",
  "message": "Called about booking an appointment."
}
```

Expected behavior:

- valid payload creates or updates one lead
- repeated payload updates the matching lead
- phone or email is required
- no provider send occurs
- no review request is sent
- no automation action is approved automatically

See `docs/lead-webhook.md` for the full webhook contract.

For the full pilot workflow, provider validation steps, mobile QA, and Supabase
redirect URL checklist, see `docs/concierge-pilot.md`.

## Verification Commands

Run before committing:

```powershell
npm run test
npm run lint
npm run build
git diff --check
```

## Automation API Safety Smoke Tests

Missing secret should return `401`:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{}'
```

Provider sends requested should return `400`:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/automations/run" `
  -Method POST `
  -Headers @{ Authorization = "Bearer YOUR_SECRET" } `
  -ContentType "application/json" `
  -Body '{"businessId":"BUSINESS_ID","dryRun":true,"allowProviderSends":true}'
```

Repeat the same safety checks for:

```text
/api/automations/scheduled-run
```

These routes must never send providers.

## Manual QA Checklist

Auth:

- sign up
- sign in
- invalid login
- forgot password request
- update password from reset email
- sign out

Owner workflow:

- open `/dashboard`
- open `/setup`
- confirm server/provider readiness shows no secrets
- open `/settings`
- add/update business profile
- add Google review link
- open `/billing` and confirm pilot billing is manual

CRM:

- create a lead manually
- create a lead through the private webhook
- open `/leads`
- open `/leads/[id]`
- update lead status
- confirm missing destination blocks review sends
- confirm missing review link blocks review sends
- confirm test/skip mode records no live provider message
- confirm repeat-click does not create duplicate skipped review requests

Automations:

- run dry-run automation check
- run confirmed automation check
- confirm pending actions appear
- approve/review/dismiss one action at a time
- confirm no send-all, bulk send, retry send, cron send, or automatic provider
  send exists

Mobile:

- login on iPhone LAN URL
- dashboard loads
- setup page loads
- leads list loads
- lead detail action cards are usable
- review request dialog/button semantics work
- automation action approval remains one-action-at-a-time

## Production Readiness Checklist

Before a first paid customer:

- guard all internal/admin routes
- confirm password reset works with production Supabase redirect URLs
- apply all migrations
- configure production env vars
- keep test/skip mode active until one provider is intentionally validated
- validate exactly one provider/channel with one test lead
- confirm webhook ingestion from the real missed-call/form source
- confirm owner can understand setup status
- confirm no fake billing/trial UI is shown
- run test/lint/build

Still deferred:

- Stripe billing and entitlements
- provider delivery callbacks/replies
- SMS STOP handling at scale
- full phone-provider missed-call integration
- team invites and advanced RBAC
- public self-serve onboarding
- premium UI redesign
