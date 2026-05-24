# Business Onboarding and Provider Readiness

Phase 7A adds a guided setup center for real businesses. The goal is to make the app explain what is ready, what is blocked, and what the operator should do next.

## Setup Route

Open:

```text
/setup
```

The setup page evaluates:

- business profile completeness
- Google review link readiness
- SMS provider readiness
- email provider readiness
- lead/customer data readiness
- automation readiness
- lead capture webhook readiness
- safe manual send readiness

The page does not expose provider secrets, automation run secrets, webhook secrets, Supabase service-role keys, Twilio auth tokens, or Resend API keys.

## Readiness Checks

### Business Profile

Required basics:

- business name
- website
- public phone
- public email
- timezone

These values are edited through the existing business settings form.

### Review Setup

Review requests are blocked until:

- a Google review link is configured
- the review request automation has a default message template

Use compliance-safe language. Do not claim the product generates five-star reviews, filters bad reviews, removes negative reviews, or offers incentives.

Blocked review requests are recorded with a safe reason and no provider call. Failed review requests mean delivery was attempted through the provider helper and did not complete.

Phase 7D keeps retry guidance operator-only. The app explains what to fix, but it does not add automatic retries, cron retries, send-all behavior, or browser-side provider sends.

Phase 7E adds final manual-send readiness guardrails. Setup and settings show safe send mode/readiness without exposing secrets. Manual live sends require an explicit operator action and confirmation. Preflight helpers do not send messages; the Phase 7C server send helper remains authoritative when a request is submitted.

Phase 8 provider validation should start from this readiness view. Confirm
test/skip mode first, then blocked provider configuration, then exactly one
intentional live provider/channel with one test lead. Provider secrets remain
server-only, and scheduled automation routes still cannot send provider
messages.

Phase 8A must pass before configuring a real provider. It confirms duplicate
prevention uses the same destination-aware dedupe identity in preflight and
final send, and that operator-visible failure reasons are sanitized. Raw
provider diagnostics may be logged server-side for debugging, but they are not
stored as user-facing review request reasons or shown in setup/readiness UI.

### SMS Readiness

SMS readiness is determined server-side from safe booleans only.

Ready when either:

- local/test delivery is active, or
- Twilio account credentials are configured and either a messaging service or from number is configured

The browser never receives the Twilio SID, auth token, messaging service SID, or sender secret values.

### Email Readiness

Email readiness is determined server-side from safe booleans only.

Ready when either:

- local/test delivery is active, or
- Resend API key and sender email are configured

The browser never receives the Resend API key.

### Automation Readiness

Automation readiness checks:

- default automations exist
- at least one automation is active
- lead follow-up is enabled
- scheduling is enabled or manual-only
- recent run or pending action exists

Important: scheduled checks create pending actions. They do not send messages automatically.

### Lead Capture Readiness

Lead capture readiness checks whether the business has a webhook secret and recent webhook events. The setup page shows status only. It does not expose the raw webhook secret.

## Manual Approval Model

Automation runs and scheduled checks only create pending automation actions. Operators manually approve and send one action at a time from the Automations page.

The app must not add:

- automatic SMS sends
- automatic email sends
- automatic review request sends
- send-all controls
- browser-triggered cron calls with secrets

## New Business Setup Checklist

1. Create business profile.
2. Add public contact details.
3. Add Google review link.
4. Confirm provider readiness.
5. Add first customer.
6. Send a manual review request.
7. Enable automations.
8. Run a dry-run.
9. Run a confirmed automation check.
10. Review pending actions.
11. Approve/send one safe action.

## Smoke Tests

Open setup:

```text
http://localhost:3000/setup
```

Expected:

- page renders without crashing
- missing setup items are clearly listed
- provider readiness shows only safe statuses
- no secret values are visible

Business profile:

- update business name, website, phone, email, and timezone
- expected: values save and readiness updates

Review link:

- remove Google review link
- expected: review setup shows blocked
- add a valid review link
- expected: review setup moves toward ready

Provider readiness:

- with missing provider env vars, SMS/email show blocked or test-mode ready
- expected: no Twilio/Resend secret values appear in the UI

Dashboard:

- open `/dashboard`
- expected: setup summary card appears and links to `/setup`

Automations:

- open `/automations`
- expected: setup warning appears if relevant
- existing automation cards still work
- pending queue still works
- manual Approve & send still works or safely blocks based on readiness

Regression:

- `/api/automations/run` still rejects `allowProviderSends:true`
- `/api/automations/scheduled-run` still rejects `allowProviderSends:true`
- cron does not send messages
- provider sends happen only after a logged-in operator clicks one manual send action
