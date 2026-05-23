-- Phase 6E: Manual approval to controlled provider send
-- Adds send-state fields to automation_actions without enabling automatic sends.

alter table automation_actions
  drop constraint if exists automation_actions_status_check;

alter table automation_actions
  add constraint automation_actions_status_check
  check (
    status in (
      'pending_review',
      'reviewed',
      'dismissed',
      'approved_pending_send',
      'sent',
      'send_failed',
      'blocked'
    )
  );

alter table automation_actions
  add column if not exists sent_at timestamptz,
  add column if not exists send_status text,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_response_json jsonb,
  add column if not exists send_error text;

alter table automation_actions
  drop constraint if exists automation_actions_send_status_check;

alter table automation_actions
  add constraint automation_actions_send_status_check
  check (
    send_status is null
    or send_status in ('pending', 'sent', 'failed', 'blocked', 'skipped')
  );

drop index if exists idx_automation_actions_active_dedupe;

create unique index if not exists idx_automation_actions_active_dedupe
  on automation_actions(business_id, dedupe_key)
  where status in ('pending_review', 'approved_pending_send', 'sent');

create index if not exists idx_automation_actions_send_status
  on automation_actions(business_id, send_status);
