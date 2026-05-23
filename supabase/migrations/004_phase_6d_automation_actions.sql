-- Phase 6D: Pending automation action review queue
-- Creates business-scoped reviewable automation actions without enabling sends.

create extension if not exists "pgcrypto";

create table if not exists automation_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  review_request_id uuid references review_requests(id) on delete set null,
  action_type text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'reviewed', 'dismissed', 'approved_pending_send')),
  channel text check (channel is null or channel in ('sms', 'email')),
  title text not null,
  summary text,
  suggested_message text,
  reason text not null,
  reason_code text,
  source text not null default 'automation_run',
  run_id uuid,
  audit_log_id uuid references audit_logs(id) on delete set null,
  dedupe_key text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  dismissed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automation_actions_business
  on automation_actions(business_id);

create index if not exists idx_automation_actions_status
  on automation_actions(business_id, status);

create index if not exists idx_automation_actions_created
  on automation_actions(business_id, created_at desc);

create index if not exists idx_automation_actions_dedupe
  on automation_actions(business_id, dedupe_key);

create unique index if not exists idx_automation_actions_active_dedupe
  on automation_actions(business_id, dedupe_key)
  where status = 'pending_review';

alter table automation_actions enable row level security;

drop policy if exists "automation_actions_select" on automation_actions;
drop policy if exists "automation_actions_update" on automation_actions;

create policy "automation_actions_select"
  on automation_actions for select
  to authenticated
  using (business_id = public.current_business_id());

create policy "automation_actions_update"
  on automation_actions for update
  to authenticated
  using (
    business_id = public.current_business_id()
    and public.current_user_role() in ('owner', 'manager', 'admin')
  )
  with check (
    business_id = public.current_business_id()
    and public.current_user_role() in ('owner', 'manager', 'admin')
  );

drop trigger if exists automation_actions_updated_at on automation_actions;

create trigger automation_actions_updated_at before update on automation_actions
  for each row execute function update_updated_at();
