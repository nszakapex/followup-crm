# CRM contact detail

Phase 7B adds a business-scoped lead/contact detail experience. The current product model uses `leads` as the shared lead/customer record, so `/leads/[id]` is the canonical detail page. `/customers/[customerId]` is a safe alias that verifies the record belongs to the active business, then redirects to the matching lead detail page.

## What the detail page shows

- Profile and contact information
- Lead status, source, created date, last contacted date, and follow-up count
- Review request summary and recent request history
- Pending automation actions for that record
- Recent automation outcomes
- Messages, inbound form notes, outbound provider records, and internal notes
- A normalized activity timeline
- A deterministic next best action

The page is useful even when the record has no messages, review requests, or automation actions. Empty states render instead of crashing.

## Activity timeline sources

The timeline is assembled server-side from business-scoped records:

- `leads`
- `messages`
- `review_requests`
- `automation_actions`
- matching `audit_logs` entries where the lead is the logged entity

Timeline entries show human-readable titles and safe metadata only. The UI does not render raw provider payloads, auth headers, webhook secrets, automation secrets, or provider credentials.

Phase 7C expands review request timeline visibility. Lead detail now distinguishes:

- review request created
- review request sent
- review request blocked before provider delivery
- review request failed after a provider/helper attempt
- duplicate review request prevented
- review link clicked

Blocked and failed events include safe human-readable reasons. Duplicate-prevented events explain that a matching recent request already exists.

Phase 7D uses the shared review request lifecycle display helper so the contact detail page uses the same wording as `/reviews`. The review history now shows whether anything was sent, safe destination/provider context, lifecycle reason, and the next operator action. Retry guidance is informational only; no retry send button is added from the detail page.

Phase 7E adds manual send preflight visibility to lead detail pending automation actions. When a pending review-request action is shown, the page displays whether the approval would be live, test, skip, or blocked before the operator clicks. Live approval uses an explicit confirmation prompt and remains one action at a time.

Phase 8 validates the same manual-only model for direct review requests. A
single controlled provider attempt starts from an operator click, goes through
server-side preflight and confirmation, and then appears in the lead timeline
as sent, blocked, failed, duplicate-prevented, or test/skipped. No customer or
lead detail page contains send-all, bulk-send, cron-send, or retry-send
controls.

Phase 8A keeps that model unchanged while tightening two pre-provider safety
details. Duplicate-prevented timeline/history entries now reflect the exact
dedupe identity: business, lead/contact, channel, and normalized destination.
Failed entries continue to show safe operator-facing summaries only; raw
provider/helper diagnostics stay server-side and are not rendered in the CRM.

Phase 9 adds follow-up planning context to the same manual queue. Lead detail
and Automations show why a follow-up action exists, the sequence/action type,
the destination summary, manual approval requirement, and the next operator
action. Processed, skipped, blocked, and failed queue items are not actively
sendable.

Phase 10 keeps the CRM vertical-agnostic. Generic product surfaces should keep
using reusable CRM language like leads, customers, follow-ups, review requests,
and pending automation actions. If a business type resolves to
`auto_detailing`, suggested messages and action reasons may mention detailing,
vehicles, ceramic coating, or estimates, but the CRM itself should not become
detailing-only. Unknown or unset business types use generic service-business
templates.

Phase 11 adds pre-beta reliability visibility without changing send behavior.
The Setup page shows beta readiness, data integrity findings, recent safety
events, and the current provider mode. These diagnostics are read-only: they do
not send providers, queue work, repair data, expose secrets, add bulk controls,
or add automatic sending.

## Pending automation action controls

The detail page reuses the existing automation action server actions:

- Mark reviewed
- Dismiss
- Approve & send

Approve & send is still one action at a time. It uses the existing Phase 6E provider-safe path and remains blocked by provider readiness, opt-out checks, business scoping, duplicate prevention, and action status checks.

There is no send-all control and no automatic sending from this page.

## Next best action logic

The next best action is deterministic:

- Missing phone/email: add contact information
- Pending automation action exists: review that action
- Failed or blocked send exists: review the send issue
- Missing Google review link: complete setup
- Provider readiness blocked: complete setup
- Completed lead with no review request: send a review request
- New or needs-reply lead: review lead details
- Otherwise: no immediate action

No AI is used and no action is created automatically.

## Safety boundaries

- No automatic SMS or email sends were added.
- No cron sends were added.
- No bulk messaging or send-all behavior was added.
- No retry send or send-anyway duplicate bypass was added.
- No browser secret exposure was added.
- Business scoping is enforced by querying the active user's `users.business_id`.
- Cross-business records are not shown.
- Provider secrets and automation/cron secrets are not displayed or logged.

## Smoke test checklist

1. Open `/leads/[leadId]`.
2. Confirm the profile data renders.
3. Confirm the timeline renders, including the empty state when there are no events.
4. Confirm pending automation actions render when present.
5. Mark a pending action reviewed and confirm the detail page updates.
6. Dismiss a pending action and confirm it leaves the pending queue.
7. Approve & send one pending action and confirm it either sends through the existing safe path or blocks with a readiness reason.
8. Confirm a sent, reviewed, dismissed, failed, or blocked action cannot be sent again.
9. Open `/customers/[leadId]` and confirm it redirects to `/leads/[leadId]`.
10. Confirm `/automations`, `/setup`, `/reviews`, and `/messages` still load.

## Demo pending-action fixture

The demo seed includes two automation smoke-test leads:

- Avery Parker: a completed demo customer with no seeded review request.
- Liam Hughes: a new missed-call demo lead.

After a demo reset/seed and a confirmed automation run, these records should create pending automation actions without calling SMS, email, Twilio, Resend, or review request delivery. The reset script deletes automation actions linked to demo leads before deleting those leads, so stale pending actions do not survive a fresh fixture reset.

## Phase 12 Concierge Pilot Checklist

Before a real local service business uses the CRM:

1. Confirm `/admin` is not visible or usable by a normal business user.
2. Confirm the owner can request a password reset from `/login`.
3. Confirm `/setup` shows business profile, review link, delivery mode, server
   configuration, and lead capture readiness without exposing secrets.
4. Confirm `/billing` clearly says pilot billing is handled manually.
5. Confirm the private lead webhook can create or update one test lead.
6. Confirm the owner can view that lead and approve actions one at a time.
7. Confirm no send-all, bulk send, retry send, cron send, or automatic provider
   send exists.
8. Run `npm run test`, `npm run lint`, and `npm run build`.

Use [concierge-pilot.md](./concierge-pilot.md) for the full Phase 13 pilot
workflow, webhook validation, provider validation, and mobile QA checklist.
