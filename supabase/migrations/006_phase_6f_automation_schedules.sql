-- Phase 6F: Production cron scheduling readiness
-- Adds explicit business-level scheduling eligibility for safe automation checks.

create extension if not exists "pgcrypto";

create table if not exists automation_schedules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references businesses(id) on delete cascade,
  enabled boolean not null default false,
  frequency text not null default 'manual_only'
    check (frequency in ('manual_only', 'daily', 'weekly')),
  timezone text not null default 'America/Denver',
  preferred_hour integer
    check (preferred_hour is null or (preferred_hour >= 0 and preferred_hour <= 23)),
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_status text
    check (
      last_status is null
      or last_status in ('completed', 'failed', 'no_enabled_automations', 'no_eligible_businesses')
    ),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automation_schedules_business
  on automation_schedules(business_id);

create index if not exists idx_automation_schedules_enabled
  on automation_schedules(enabled);

create index if not exists idx_automation_schedules_next_run
  on automation_schedules(enabled, next_run_at);

create index if not exists idx_automation_schedules_last_run
  on automation_schedules(business_id, last_run_at desc);

alter table automation_schedules enable row level security;

drop policy if exists "automation_schedules_select" on automation_schedules;
drop policy if exists "automation_schedules_insert" on automation_schedules;
drop policy if exists "automation_schedules_update" on automation_schedules;

create policy "automation_schedules_select"
  on automation_schedules for select
  to authenticated
  using (business_id = public.current_business_id());

create policy "automation_schedules_insert"
  on automation_schedules for insert
  to authenticated
  with check (
    business_id = public.current_business_id()
    and public.current_user_role() in ('owner', 'manager', 'admin')
  );

create policy "automation_schedules_update"
  on automation_schedules for update
  to authenticated
  using (
    business_id = public.current_business_id()
    and public.current_user_role() in ('owner', 'manager', 'admin')
  )
  with check (
    business_id = public.current_business_id()
    and public.current_user_role() in ('owner', 'manager', 'admin')
  );

drop trigger if exists automation_schedules_updated_at on automation_schedules;

create trigger automation_schedules_updated_at before update on automation_schedules
  for each row execute function update_updated_at();
