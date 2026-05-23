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
