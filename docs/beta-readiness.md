# Beta Readiness and Diagnostics

Phase 11 adds reliability and observability checks for pre-beta use. These checks
are read-only. They do not send messages, queue actions, repair rows, or modify
Supabase data.

## What Phase 11 Checks

The beta readiness helper evaluates one business workspace:

- business profile exists and has a name
- selected workflow type resolves, with `generic_service_business` fallback
- Google review link exists and looks like an HTTP/HTTPS URL
- current provider mode is `test`, `skip`, `live`, or `blocked`
- manual live sending is available or unavailable
- pending, blocked, and failed automation action counts
- completed leads ready for review-request QA
- leads missing phone/email for blocked-state testing
- recent review request and duplicate-prevented counts
- stale pending actions with existing handled review requests
- duplicate pending actions by dedupe identity
- recent automation run history
- demo/beta fixture markers when present

The data integrity checker looks for broken or suspicious states:

- automation actions linked to missing leads
- review requests linked to missing leads
- review requests linked to missing automation actions
- pending actions that already have handled review requests
- duplicate pending action dedupe keys
- duplicate active review request dedupe keys
- lifecycle timestamp/status mismatches
- provider message IDs without provider labels
- provider response metadata that looks secret-like
- unsafe failure text that looks like raw stack traces or provider internals
- blocked, failed, or duplicate-prevented rows without safe reasons
- send-capable actions missing required destinations

No destructive repair actions are included in Phase 11.

## Operator Visibility

The Setup page shows:

- beta readiness summary
- current provider mode
- resolved business vertical
- manual beta/live-provider readiness
- data integrity status and findings
- recent safety events from review request and automation action outcomes

Dashboard pages also show a safety mode banner:

- `Test mode active` means no live provider message will be sent.
- `Skip mode active` means provider delivery is disabled.
- `Live mode active` means manual sends can attempt real delivery only after confirmation.
- `Provider blocked` means setup is incomplete and no live provider message can be sent.

## Verification Script

Run the read-only beta verification script:

```powershell
npm run verify:beta -- --business-id=BUSINESS_ID
```

If `--business-id` is omitted, the script looks for a business with demo seed
leads. It checks detailing beta fixtures, fake/test contact data, review-ready
completed leads, missing-destination fixtures, duplicate-risk fixtures, orphaned
actions, duplicate pending action groups, and stale handled pending actions.

The script prints `PASS`, `WARN`, and `FAIL` lines. It never prints secrets,
never calls providers, and never mutates data.

## Required Pre-Beta Checks

Before using a detailing beta workspace:

1. Apply all required migrations, including Phase 7C lifecycle migration 007.
2. Run `npm run lint`.
3. Run `npm run build`.
4. Run `git diff --check`.
5. Run `npm run verify:beta -- --business-id=BUSINESS_ID`.
6. Open `/setup` and review beta readiness and data integrity diagnostics.
7. Open `/automations` and confirm no send-all, bulk-send, or auto-send controls exist.
8. Create or approve one test/skip action and confirm no provider call occurs.
9. Click the same processed action again and confirm no duplicate skipped row is created.
10. Confirm `/api/automations/run` and `/api/automations/scheduled-run` still reject `allowProviderSends:true`.

## Safety Boundaries

Phase 11 does not add:

- automatic provider sends
- cron provider sends
- scheduled provider sends
- background provider sends
- bulk messaging
- send-all
- retry sending
- provider calls from client components
- secret exposure in UI
- data repair mutations

Provider sends remain manual, server-side, one action at a time, readiness
checked, duplicate protected, and confirmation gated.
