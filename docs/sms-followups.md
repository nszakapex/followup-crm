# Automated SMS Follow-Ups (Twilio A2P)

Phase 17 makes the SMS follow-up loop launch-ready: when the A2P campaign is
approved, flipping `SMS_ENABLED=true` + `SMS_PROVIDER=twilio` +
`SMS_COMPLIANCE_APPROVED=true` turns on a working, compliant SMS follow-up
sequence. Nothing else needs to change on approval day.

This extends (does not replace) `docs/sms-compliance.md`. Where that document
says automation routes never send providers, this phase is the deliberate,
gated exception described below.

## The sequence

Evidence behind the cadence: contacting a lead within 5 minutes instead of 30
makes qualification ~21x more likely (MIT/InsideSales study); most buyers go
with the first responder; typical sellers give up after ~1.3 attempts. So: one
instant touch, a short multi-attempt tail, then stop.

| Step | When | Template | Where it fires |
|---|---|---|---|
| First touch | T+0, on lead create (webhook + manual) | `firstTouch` in `src/lib/sms/templates.ts` | `sendFirstTouchSms` called from both lead webhooks and the manual create action |
| Day 1 | +24h, no reply | `twenty_four_hour_followup` automation | scheduled run |
| Day 3 | +72h, no reply | `three_day_followup` automation | scheduled run |
| Day 7 (final) | +168h, no reply | `seven_day_followup` automation (new) | scheduled run |

Max 4 messages per inquiry - enforced by the compliance gate
(`sequence_exhausted`), matching the "1-4 messages per inquiry" frequency
registered on the campaign.

Stop conditions (any of): inbound reply (lead becomes `needs_reply`, which no
follow-up rule targets, and pending queued SMS actions are dismissed), status
moves to booked/completed/lost, opt-out (STOP, carrier error 21610, or
suppression list), or the sequence is exhausted.

The sequence is stateless: steps are derived from lead `status` +
`last_contacted_at` plus the dedupe keys on `automation_actions`, and the
`messages.kind` counter caps the total. There is no step column.

## The compliance gate

Every live SMS passes `evaluateSmsSendGate` (`src/lib/messaging/sms-compliance-core.ts`)
inside `sendSms`. Checks, in order, each with a logged block reason:

1. `sms_disabled` - `SMS_ENABLED` not true
2. `provider_mock` - no real provider selected
3. `compliance_not_approved` - no A2P approval recorded
4. `suppressed` - phone is on `sms_suppressions` (survives lead deletion)
5. `opted_out` - lead consent revoked (absolute; no message kind overrides it)
6. `no_documented_consent` - business-initiated sends require `opted_in`;
   only a direct `reply` may go out on `unknown`
7. `sequence_exhausted` - 4 first-touch/follow-up messages already sent
8. `quiet_hours` - outside 8:00-19:59 in the business timezone (TCPA window
   is 8am-9pm recipient-local; we stop at 8pm as buffer and use the business
   timezone as the proxy since local-service leads are local)

Mock/test modes short-circuit before the gate, so local behavior is unchanged.

## Consent capture

- **Webhook leads**: pass `sms_consent: "granted"` (top level or inside
  `metadata`) plus optional `sms_consent_source` (e.g. `meta_lead_form`). The
  lead is stored `opted_in` with a timestamp. Anything else stays `unknown` -
  follow-up remains email-only for that lead. Duplicate submissions may only
  upgrade `unknown -> opted_in`; `opted_out` is never downgraded.
- **Manual leads**: the Add Lead dialog has an "SMS consent obtained" toggle
  (`sms_consent_source='verbal'`, noted on the lead for A2P audits).
- **Inbound START**: re-opt-in (`sms_consent_source='inbound_sms'`), clears
  the suppression row.
- Phones are normalized to E.164 into `leads.phone_e164` on every write path.

## Webhooks

- Inbound: `POST /api/webhooks/twilio/inbound` does not exist; the existing
  route `POST /api/webhooks/twilio/sms` was extended instead. STOP-family ->
  consent revoked + suppression upsert (even when no lead matches); START ->
  re-opt-in; HELP -> log only; anything else -> lead `needs_reply` + pending
  SMS follow-ups dismissed.
- Delivery status: `POST /api/webhooks/twilio/status` (new) updates the
  `messages` row by MessageSid (status + `error_code`); error 21610 records a
  durable opt-out.
- With `TWILIO_ADVANCED_OPT_OUT=true`, the app returns empty TwiML for
  keyword messages and lets Twilio's Advanced Opt-Out send the registered
  confirmations (avoid double replies). Leave false until Advanced Opt-Out is
  enabled in the console.
- `TWILIO_WEBHOOK_VALIDATE_SIGNATURE=true` enforces signature validation;
  enable in production after confirming `APP_URL` matches the URLs configured
  in Twilio.

## Automated dispatch

The runner (`run-automations-core.mjs`) stays queue-only. Dispatch is a new
phase in the automation routes (`autoSendPendingSmsFollowUps`):

- Runs only when `SMS_ENABLED` + real `SMS_PROVIDER` + `SMS_COMPLIANCE_APPROVED`
  are all set (`isSmsProviderSendReady`) and the run is confirmed (not dry-run).
- Only `follow_up_message` SMS actions are auto-sent. **Review requests still
  require a manual dashboard approval.**
- Quiet hours are pre-checked so due actions stay `pending_review` and retry
  on the next cron tick instead of being permanently blocked.
- Each dispatch goes through `sendAutomationAction` (claim, dedupe, provider
  readiness) and then the full compliance gate. One log line per lead:
  sent / skipped(reason).
- Known v1 limitation: a transient provider failure marks the action
  `send_failed` and that step is not retried (the next sequence step still
  fires). Permanent failures (21211/21610/21614) must not be retried anyway.

Scheduling: `vercel.json` runs `GET /api/automations/scheduled-run` every 10
minutes. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. A cron tick
runs confirmed with defaults; every 10 minutes is enough because the T+0 first
touch fires at lead creation, not from cron.

## Twilio console checklist (~15 min, manual)

1. Messaging -> Services: create/confirm a Messaging Service; add the 10DLC
   number to its sender pool. Put the Service SID in
   `TWILIO_MESSAGING_SERVICE_SID` (the adapter prefers it over a bare From).
2. Link the A2P campaign to this Messaging Service (Compliance -> A2P
   registration). Sends through the service then carry the campaign's
   throughput and trust score.
3. Integration settings: "A message comes in" ->
   `https://<prod-domain>/api/webhooks/twilio/sms` (HTTP POST); delivery
   status callback -> `https://<prod-domain>/api/webhooks/twilio/status`.
   (The status URL is also set per-message via StatusCallback when `APP_URL`
   is configured.)
4. Enable Advanced Opt-Out on the service and paste the confirmations from
   `docs/a2p-campaign-copy.md` sections 4-5, then set
   `TWILIO_ADVANCED_OPT_OUT=true`.
5. After campaign approval: `TWILIO_A2P_CAMPAIGN_STATUS=approved` (label) and
   `SMS_COMPLIANCE_APPROVED=true` (the actual gate).

## Rollout order (safe path)

1. Merge + deploy with `SMS_ENABLED=false`. Everything stays dark; tests,
   lint, and build green; webhook routes live but idle. Apply migration 010.
2. Configure the Twilio console (checklist above). Text the 10DLC number from
   your phone: confirm the inbound `messages` row and STOP/START behavior.
3. Submit the A2P campaign - cross-check against `docs/a2p-campaign-copy.md`
   first, especially the privacy-policy non-sharing clause and the opt-in
   proof URL. Keep the registered samples identical to
   `src/lib/sms/templates.ts` and the seeded automation templates.
4. On approval: set `SMS_PROVIDER=twilio`, `SMS_ENABLED=true`,
   `SMS_COMPLIANCE_APPROVED=true`, redeploy (existing deployments keep old
   env). Create one test lead with your own number and consent metadata;
   verify the first touch arrives, delivery status lands on the message row, a
   reply flips the lead to `needs_reply`, and STOP suppresses.
5. Enable `TWILIO_WEBHOOK_VALIDATE_SIGNATURE=true` once step 4's webhooks are
   confirmed, and re-test one inbound message.
6. Watch the first week: delivery rate via `messages.error_code`
   (30034 = campaign not linked to the service; 30007 = carrier filtering -
   recheck copy). Review non-keyword messages that read like opt-outs ("stop
   texting me pls") and suppress those numbers manually - the FCC requires
   honoring revocation by any reasonable means.

## Ongoing

- A2P registrations renew every 12 months - set a reminder ~11 months out.
- If message copy drifts from the registered use case, update the campaign
  first, then the templates.
- Existing businesses seeded before this phase keep their old automation
  templates; align them with `docs/a2p-campaign-copy.md` samples (Settings ->
  Automations) before going live. New/missing automations seed the A2P copy
  automatically, and all automations ship disabled - enable the three
  follow-up automations per business as part of step 4.
- Multi-tenant later: consent, suppressions, and events are keyed by
  business_id already; per-business Twilio subaccounts/campaigns is the
  future step, not needed for single-business v1.
