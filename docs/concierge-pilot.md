# Concierge Pilot Validation

Phase 13 validates FollowUp CRM as a manually supported pilot for one local
service business. This is not a self-serve SaaS launch and not an automation
send phase.

FollowUp CRM remains focused on missed-call/form lead capture, lead follow-up,
review requests, and owner-facing CRM visibility.

This phase does not add:

- automatic provider sends
- cron or scheduled provider sends
- bulk sends or send-all
- retry sends
- cold email, scraping, website mockups, ad audits, prospecting, or agents

## End-to-End Pilot Workflow

1. Create or sign up the business account.
2. Open `/setup` and confirm server configuration/readiness is understandable.
3. Open `/settings` and complete the business profile.
4. Add the Google review link.
5. Confirm delivery mode is test, skip, blocked, or live.
6. Confirm the private lead capture webhook is configured.
7. Send one missed-call/form-style test payload to the webhook.
8. Open `/leads` and confirm the lead appears.
9. Open `/leads/[id]` and confirm contact details, source, timeline, and next action.
10. Update the lead status, such as contacted, booked, completed, or lost.
11. Create or review one manual follow-up/review action.
12. Submit one manual review/follow-up action only if readiness copy says it is safe.
13. Confirm `/reviews` and `/leads/[id]` show the lifecycle outcome.
14. Repeat the same action/request and confirm duplicate prevention or already-processed protection.
15. Test the same flow on a phone and desktop.

## Pilot Webhook Validation

Endpoint:

```http
POST /api/webhooks/leads/[businessId]/[secret]
```

Local example:

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://localhost:3000/api/webhooks/leads/BUSINESS_ID/WEBHOOK_SECRET" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{
    "fullName": "Taylor Pilot",
    "phone": "5550102002",
    "email": "taylor@example.test",
    "source": "Missed call - pilot validation",
    "message": "Called about booking a service."
  }'
```

Expected:

- `201` for a new lead or `200` for an updated matching lead
- response includes `success:true` and `leadId`
- lead appears in `/leads`
- `/leads/[id]` shows the webhook source/details
- no SMS, email, review request, or provider send occurs

Duplicate check:

1. Send the same payload twice.
2. Confirm the second request updates the existing lead.
3. Confirm no duplicate lead is created for the same email/phone in the same business.

Invalid payload checks:

- invalid business id should return `400`
- invalid secret should return `401`
- missing contact destination should return `400`
- non-JSON or unsupported shape should return `400`

## Controlled Provider Validation

Validate exactly one provider/channel at a time.

Phase 14 selected **Resend email** as the first channel to validate because the
app already had a server-only email helper, and SMS carrier/STOP handling was
intentionally deferred until the Phase 16 compliance gate.

Start in test/skip mode:

```text
REVIEW_REQUEST_TEST_MODE=true
REVIEW_REQUEST_SKIP_DELIVERY=true
```

Expected:

- UI says no live message will be sent
- manual submit records a skipped/not-attempted lifecycle outcome
- no provider call occurs
- duplicate prevention still runs

Blocked provider check:

1. Remove or omit provider env vars.
2. Open `/setup` and `/settings`.
3. Confirm provider readiness says blocked/missing without showing secrets.
4. Attempt a manual request only if the UI allows recording a safe blocked outcome.
5. Confirm no provider call occurs.

One live channel check:

1. Configure exactly one provider/channel in server env. For Phase 14 email,
   set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; leave SMS provider variables
   unused for this test.
2. Set both safety flags to false intentionally.
3. Restart the app.
4. Open `/setup` and confirm live mode is visible.
5. Use one real email destination owned by the operator.
6. Create or open one test lead with that email address and a configured Google
   review link.
7. Submit one direct manual review request after the live confirmation.
8. Confirm `review_requests` records `sent` or `failed` with safe metadata:
   `status`, `send_status`, `provider`, `provider_message_id` when available,
   timestamps, and safe failure text if delivery fails.
9. Repeat the same request and confirm duplicate prevention prevents a second
   provider call.
10. Return test/skip mode after validation if the pilot is not ready for live sends.

Never validate live sending from automation run or scheduled-run routes.

### SMS After A2P Approval

SMS remains blocked for live sending until Twilio A2P 10DLC approval is
confirmed and `SMS_COMPLIANCE_APPROVED=true` is intentionally set. Before any
manual SMS field test:

1. Apply `supabase/migrations/008_phase_16_sms_compliance_inbound.sql`.
2. Set `businesses.twilio_from_number` to the Twilio number that receives
   replies.
3. Configure Twilio inbound SMS webhook:
   `https://YOUR_DOMAIN/api/webhooks/twilio/sms`.
4. Send `HELP` from an operator-owned phone and confirm the reply is stored on
   `/messages` and `/leads/[id]`.
5. Send `STOP` from the same phone and confirm the lead becomes opted out.
6. Confirm an opted-out lead cannot receive manual SMS.

Do not test instant SMS automation in this phase. No automation route can send
SMS.

Rollback/disable steps after the test:

```text
REVIEW_REQUEST_TEST_MODE=true
REVIEW_REQUEST_SKIP_DELIVERY=true
```

Restart the app after changing these values. The setup/settings readiness copy
should return to test or skip mode, and no live provider message should be sent.

## Minimal Smoke Checks

After `npm run build`, run:

```powershell
npm run test:smoke
```

This starts the built app on a local test port and checks:

- `/login`
- `/signup`
- `/forgot-password`
- `/update-password`
- unauthenticated `/dashboard`
- unauthenticated `/setup`
- unauthenticated `/leads`
- unauthenticated `/billing`

These route checks do not require Supabase test data, do not use provider
credentials, and do not call SMS or email providers. Full authenticated browser
coverage remains a later task once a stable test account and browser automation
fixture are available.

## Supabase Redirect URLs

Configure these in Supabase:

Authentication -> URL Configuration -> Redirect URLs

Local development:

```text
http://localhost:3000/**
http://localhost:3000/callback
http://localhost:3000/update-password
```

Mobile LAN testing:

```text
http://PC_LAN_IP:3000/**
http://PC_LAN_IP:3000/callback
http://PC_LAN_IP:3000/update-password
```

Production:

```text
https://YOUR_DOMAIN/**
https://YOUR_DOMAIN/callback
https://YOUR_DOMAIN/update-password
```

Also set `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_SITE_URL` to the production
origin for deployed auth and reset links.

## Mobile QA

Run this on iPhone or Android over the LAN URL or production URL:

1. Load `/login`.
2. Sign in.
3. Load `/dashboard`.
4. Open `/setup`.
5. Open `/settings`.
6. Open `/leads`.
7. Open one lead detail page.
8. Confirm action cards/buttons are tappable.
9. Confirm no Base UI button warnings appear in the dev console.
10. Confirm no send-all, bulk send, retry send, or cron-send controls appear.

## Pilot Readiness Checklist

The CRM is ready for one concierge pilot only when all are true:

- signup or manual account creation works
- password reset works
- normal users cannot access `/admin`
- business profile is complete
- Google review link is configured
- provider readiness is understandable
- delivery mode is intentionally test, skip, blocked, or live
- pilot webhook creates or updates a lead
- lead appears in `/leads`
- lead detail page works
- lead status updates work
- manual review/follow-up action works or safely blocks
- duplicate prevention is verified
- no automated sends are verified
- billing page says pilot billing is manual
- mobile core flow works
- `npm run test` passes
- `npm run lint` passes
- `npm run build` passes
- `git diff --check` passes

## Remaining Before Public SaaS

Still deferred after concierge pilot validation:

- Stripe billing and entitlement enforcement
- full phone-provider missed-call integration
- provider delivery callbacks/replies
- broader SMS delivery callback/compliance QA
- broader browser/Playwright automation
- team invites and advanced account management
- self-serve provider setup wizard
