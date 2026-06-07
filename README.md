# FollowUp CRM

FollowUp CRM is a lightweight follow-up system for small businesses, solo
operators, freelancers, and simple service-sales workflows. It captures leads,
tracks status, records notes/activity, schedules follow-ups, and sends owner
email alerts through Resend.

The app is generic. 96 Mobile Detailing can use it as a configured deployment,
but the code is not hardcoded to that business.

## Core Features

- Supabase email/password auth with protected dashboard routes
- Business profile/settings stored in Supabase
- Manual lead creation with idempotent email/phone duplicate handling
- Generic authenticated lead webhook at `POST /api/webhooks/leads`
- Pipeline/status tracking for new, contacted, interested, booked/completed,
  review-requested, needs-reply, and lost leads
- Lead detail page with contact info, company, interest, notes, timeline, and
  follow-up date
- Activity stored through messages/audit logs where practical
- Resend owner notification email for new manual or webhook leads
- Optional SMS provider layer with `SMS_ENABLED=false` as the safe v1 default
- Demo seed/reset scripts that run only when called manually

## Tech Stack

- Framework: Next.js App Router
- Auth/database: Supabase Auth, Postgres, RLS
- Email: Resend, server-side only
- SMS: optional provider abstraction, Twilio adapter isolated behind flags
- Package manager: npm
- Deployment target: Vercel or any Node-capable Next.js host

## Required Environment

Copy `env.example` to `.env.local` for local development and configure matching
variables in production.

Required for basic launch:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=
NEXT_PUBLIC_APP_URL=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
OWNER_NOTIFY_EMAIL=
INBOUND_WEBHOOK_SECRET=
INBOUND_WEBHOOK_BUSINESS_ID=
AUTOMATION_RUN_SECRET=
```

Recommended defaults:

```text
REVIEW_REQUEST_TEST_MODE=true
REVIEW_REQUEST_SKIP_DELIVERY=true
SMS_ENABLED=false
SMS_PROVIDER=mock
```

Optional:

```text
DATABASE_URL=
BUSINESS_NAME=
BUSINESS_EMAIL=
BUSINESS_PHONE=
BUSINESS_TIMEZONE=America/Denver
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_FROM_NUMBER=
TWILIO_PHONE_NUMBER=
TWILIO_WEBHOOK_VALIDATE_SIGNATURE=false
```

Do not prefix server secrets with `NEXT_PUBLIC_`.

## Local Setup

```powershell
npm install
copy env.example .env.local
npm run dev
```

Open `http://localhost:3000`, sign up, complete onboarding, then open
`/settings` to confirm business configuration and provider readiness.

## Database Setup

Create a Supabase project, enable email/password auth, then apply migrations in
order from `supabase/migrations`.

If using the Supabase CLI:

```powershell
supabase db push
```

If the CLI is unavailable, paste each migration into the Supabase SQL editor in
filename order. Migration `009_product_ready_v1.sql` adds v1 lead fields and
webhook lookup indexes.

Demo data is optional and never loads automatically:

```powershell
npm run seed:demo
npm run reset:demo
```

## Resend Setup

1. Create a Resend API key.
2. Verify the sending domain/address.
3. Set `RESEND_API_KEY`.
4. Set `RESEND_FROM_EMAIL`, for example `leads@updates.example.com`.
5. Set `OWNER_NOTIFY_EMAIL`.

New manual and webhook leads are saved first. If Resend is missing or fails, the
lead remains in the database and the failure is logged/handled.

## SMS And Twilio

SMS is optional for v1. Keep:

```text
SMS_ENABLED=false
```

With SMS disabled:

- lead capture works
- dashboard works
- Resend works
- Twilio variables may be missing
- no live SMS send is attempted

Only set `SMS_ENABLED=true` and `SMS_PROVIDER=twilio` after Twilio credentials,
sender/messaging service, and compliance approval are ready.

## Generic Lead Webhook

Endpoint:

```http
POST https://your-domain.com/api/webhooks/leads
```

Headers:

```http
Content-Type: application/json
x-webhook-secret: YOUR_INBOUND_WEBHOOK_SECRET
```

Payload:

```json
{
  "source": "meta_lead_ads",
  "external_id": "string",
  "name": "string",
  "email": "string",
  "phone": "string",
  "company": "string",
  "message": "string",
  "service_interest": "string",
  "metadata": {
    "form_id": "string",
    "campaign_name": "string",
    "ad_name": "string",
    "custom_field": "value"
  }
}
```

Behavior:

- rejects missing/invalid `x-webhook-secret` with `401`
- rejects invalid JSON/payloads with `400`
- dedupes by `source + external_id`, then email, then normalized phone
- creates a lead with status `new` when no duplicate exists
- updates safe missing fields on duplicates
- records webhook/message/audit activity where practical
- sends a Resend owner notification when configured

Response:

```json
{
  "ok": true,
  "lead_id": "uuid",
  "created": true,
  "duplicate": false
}
```

Verification against a running app:

```powershell
npm run test:webhook
```

## Meta Lead Ads Through Zapier Or Make

Use this v1 flow:

```text
Meta Lead Ads Form -> Zapier/Make trigger -> Webhook POST
-> /api/webhooks/leads -> CRM lead -> Resend notification -> dashboard follow-up
```

Zapier/Make setup:

1. Trigger: new Meta Lead Ads lead.
2. Action: Webhooks by Zapier/Make, custom request.
3. Method: `POST`.
4. URL: `https://your-domain.com/api/webhooks/leads`.
5. Header: `x-webhook-secret: YOUR_INBOUND_WEBHOOK_SECRET`.
6. Header: `Content-Type: application/json`.
7. Body:

```json
{
  "source": "meta_lead_ads",
  "external_id": "{{lead_id}}",
  "name": "{{full_name}}",
  "email": "{{email}}",
  "phone": "{{phone_number}}",
  "message": "{{message}}",
  "service_interest": "{{service_requested}}",
  "metadata": {
    "form_id": "{{form_id}}",
    "campaign_name": "{{campaign_name}}",
    "ad_name": "{{ad_name}}",
    "city_or_zip": "{{city_or_zip}}",
    "vehicle": "{{vehicle}}",
    "preferred_time": "{{preferred_time}}"
  }
}
```

Test once, confirm a lead appears in `/leads`, then test the same payload again
and confirm it updates the same lead.

Direct Meta OAuth/API integration is a later enhancement, not required for v1.

## Deployment

Vercel:

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Set all required environment variables.
4. Set Supabase Auth redirect URLs:
   - `https://your-domain.com/callback`
   - `https://your-domain.com/update-password`
5. Apply Supabase migrations.
6. Deploy.
7. Run checks:

```powershell
npm run test
npm run lint
npm run build
```

Post-deploy verification:

- sign up/sign in/sign out
- create a manual lead
- set a follow-up date
- add a note
- POST a webhook lead
- POST the same webhook lead again
- confirm owner notification email arrives
- confirm SMS remains disabled when `SMS_ENABLED=false`

## Example 96 Mobile Detailing Configuration

Use these as environment/configuration examples only:

```text
BUSINESS_NAME="96 Mobile Detailing"
BUSINESS_EMAIL="owner@example.com"
BUSINESS_PHONE="+15550101001"
BUSINESS_TIMEZONE="America/Denver"
RESEND_FROM_EMAIL="leads@updates.96mobiledetailing.com"
OWNER_NOTIFY_EMAIL="owner@example.com"
SMS_ENABLED=false
```

Set the actual business name/email/phone in onboarding or `/settings`.

## Troubleshooting

- `401` from webhook: missing or incorrect `x-webhook-secret`.
- `503` from webhook: set `INBOUND_WEBHOOK_SECRET` and
  `INBOUND_WEBHOOK_BUSINESS_ID`, or ensure exactly one business exists.
- Lead created but no email: check `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and
  `OWNER_NOTIFY_EMAIL`.
- SMS unavailable: expected when `SMS_ENABLED=false`.
- Protected page redirects to login: sign in again or verify Supabase auth env.
- Build needs network for fonts: this repo uses system fonts and should not
  require Google Fonts at build time.

## Verification Commands

```powershell
npm run test
npm run lint
npm run build
npm run test:smoke
git diff --check
```

`npm run test:smoke` expects a built app and checks basic route behavior.
