-- Phase 7C: Review request lifecycle and delivery status reliability
-- Adds explicit blocked/duplicate-prevented outcomes and safe provider metadata.

alter type review_request_status add value if not exists 'blocked';
alter type review_request_status add value if not exists 'duplicate_prevented';
alter type review_request_status add value if not exists 'canceled';

alter table review_requests
  add column if not exists blocked_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists duplicate_prevented_at timestamptz,
  add column if not exists send_status text,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_response_json jsonb,
  add column if not exists failure_reason text,
  add column if not exists blocked_reason text,
  add column if not exists duplicate_reason text,
  add column if not exists dedupe_key text,
  add column if not exists source text not null default 'manual',
  add column if not exists google_review_url text,
  add column if not exists automation_action_id uuid references automation_actions(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table review_requests
  drop constraint if exists review_requests_send_status_check;

alter table review_requests
  add constraint review_requests_send_status_check
  check (
    send_status is null
    or send_status in (
      'not_attempted',
      'blocked',
      'sent',
      'failed',
      'duplicate_prevented'
    )
  );

create index if not exists idx_review_requests_business_status
  on review_requests(business_id, status);

create index if not exists idx_review_requests_business_created
  on review_requests(business_id, created_at desc);

create index if not exists idx_review_requests_business_dedupe
  on review_requests(business_id, dedupe_key);

create index if not exists idx_review_requests_automation_action
  on review_requests(automation_action_id)
  where automation_action_id is not null;

drop trigger if exists review_requests_updated_at on review_requests;

create trigger review_requests_updated_at before update on review_requests
  for each row execute function update_updated_at();

update review_requests
set
  send_status = case
    when send_status is not null then send_status
    when status in ('sent', 'clicked', 'completed') then 'sent'
    when status = 'failed' then 'failed'
    else 'not_attempted'
  end,
  source = coalesce(source, 'legacy'),
  updated_at = coalesce(updated_at, created_at, now())
where send_status is null
   or source is null
   or updated_at is null;
