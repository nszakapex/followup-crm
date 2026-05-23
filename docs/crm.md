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
