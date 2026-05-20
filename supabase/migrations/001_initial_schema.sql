-- FollowUp CRM Initial Schema
-- Run this in your Supabase SQL editor

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

create type lead_status as enum (
  'new', 'contacted', 'needs_reply', 'interested',
  'booked', 'completed', 'review_requested', 'lost'
);

create type message_channel as enum ('sms', 'email', 'manual_note');
create type message_direction as enum ('inbound', 'outbound', 'internal');
create type message_status as enum ('pending', 'sent', 'delivered', 'failed', 'received');

create type automation_type as enum (
  'instant_lead_reply', 'twenty_four_hour_followup', 'three_day_followup',
  'missed_call_textback', 'review_request', 'weekly_owner_summary'
);

create type user_role as enum ('owner', 'manager', 'staff', 'admin');
create type sync_status as enum ('not_connected', 'pending', 'synced', 'failed');
create type brand_voice as enum ('friendly', 'professional', 'premium', 'casual', 'direct', 'warm');

create type integration_provider as enum (
  'zapier', 'make', 'hubspot', 'salesforce', 'jobber',
  'housecall_pro', 'google_business_profile', 'google_calendar',
  'meta', 'stripe', 'twilio', 'resend'
);

create type integration_status as enum ('active', 'inactive', 'error');
create type review_request_status as enum ('pending', 'sent', 'clicked', 'completed', 'failed');

-- ============================================================
-- TABLES
-- ============================================================

-- 1. businesses
create table businesses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  industry text,
  owner_name text not null,
  owner_email text not null,
  owner_phone text,
  website_url text,
  google_review_link text,
  timezone text not null default 'America/Denver',
  brand_voice brand_voice not null default 'friendly',
  business_hours jsonb,
  sms_enabled boolean not null default false,
  email_enabled boolean not null default true,
  review_requests_enabled boolean not null default true,
  lead_followup_enabled boolean not null default true,
  privacy_policy_url text,
  terms_url text,
  webhook_secret text default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. users
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  email text not null,
  role user_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. leads
create table leads (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  source text,
  status lead_status not null default 'new',
  intent text,
  notes text,
  ai_summary text,
  last_contacted_at timestamptz,
  next_followup_at timestamptz,
  followup_count integer not null default 0,
  external_crm_name text,
  external_crm_id text,
  sync_status sync_status not null default 'not_connected',
  opted_out boolean not null default false,
  consent_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. messages
create table messages (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  channel message_channel not null,
  direction message_direction not null,
  body text not null,
  status message_status not null default 'pending',
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

-- 5. automations
create table automations (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  type automation_type not null,
  enabled boolean not null default false,
  delay_hours integer,
  trigger_status lead_status,
  message_template text not null,
  channel message_channel not null default 'sms',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. review_requests
create table review_requests (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  customer_name text not null,
  phone text,
  email text,
  channel message_channel not null,
  message_body text not null,
  status review_request_status not null default 'pending',
  sent_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

-- 7. integrations
create table integrations (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider integration_provider not null,
  status integration_status not null default 'inactive',
  access_token_encrypted text,
  refresh_token_encrypted text,
  external_account_id text,
  settings_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, provider)
);

-- 8. webhook_events
create table webhook_events (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  source text not null,
  payload_json jsonb not null,
  processed boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

-- 9. audit_logs
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_users_business on users(business_id);
create index idx_leads_business on leads(business_id);
create index idx_leads_status on leads(business_id, status);
create index idx_leads_next_followup on leads(next_followup_at) where next_followup_at is not null;
create index idx_messages_lead on messages(lead_id);
create index idx_messages_business on messages(business_id);
create index idx_automations_business on automations(business_id);
create index idx_review_requests_business on review_requests(business_id);
create index idx_review_requests_lead on review_requests(lead_id);
create index idx_webhook_events_business on webhook_events(business_id);
create index idx_webhook_events_unprocessed on webhook_events(processed) where processed = false;
create index idx_audit_logs_business on audit_logs(business_id);
create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table businesses enable row level security;
alter table users enable row level security;
alter table leads enable row level security;
alter table messages enable row level security;
alter table automations enable row level security;
alter table review_requests enable row level security;
alter table integrations enable row level security;
alter table webhook_events enable row level security;
alter table audit_logs enable row level security;

-- Users can read their own business
create policy "Users can view own business"
  on businesses for select
  using (id in (select business_id from users where id = auth.uid()));

-- Users can update their own business (owner/manager only)
create policy "Owners can update business"
  on businesses for update
  using (id in (select business_id from users where id = auth.uid() and role in ('owner', 'manager', 'admin')));

-- Users can view team members in their business
create policy "Users can view team"
  on users for select
  using (business_id in (select business_id from users where id = auth.uid()));

-- Users can view leads in their business
create policy "Users can view leads"
  on leads for select
  using (business_id in (select business_id from users where id = auth.uid()));

create policy "Users can insert leads"
  on leads for insert
  with check (business_id in (select business_id from users where id = auth.uid()));

create policy "Users can update leads"
  on leads for update
  using (business_id in (select business_id from users where id = auth.uid()));

-- Messages
create policy "Users can view messages"
  on messages for select
  using (business_id in (select business_id from users where id = auth.uid()));

create policy "Users can insert messages"
  on messages for insert
  with check (business_id in (select business_id from users where id = auth.uid()));

-- Automations
create policy "Users can view automations"
  on automations for select
  using (business_id in (select business_id from users where id = auth.uid()));

create policy "Users can manage automations"
  on automations for all
  using (business_id in (select business_id from users where id = auth.uid() and role in ('owner', 'manager', 'admin')));

-- Review requests
create policy "Users can view review requests"
  on review_requests for select
  using (business_id in (select business_id from users where id = auth.uid()));

create policy "Users can insert review requests"
  on review_requests for insert
  with check (business_id in (select business_id from users where id = auth.uid()));

-- Integrations
create policy "Users can view integrations"
  on integrations for select
  using (business_id in (select business_id from users where id = auth.uid()));

create policy "Owners can manage integrations"
  on integrations for all
  using (business_id in (select business_id from users where id = auth.uid() and role in ('owner', 'admin')));

-- Webhook events
create policy "Users can view webhook events"
  on webhook_events for select
  using (business_id in (select business_id from users where id = auth.uid()));

-- Audit logs
create policy "Users can view audit logs"
  on audit_logs for select
  using (business_id in (select business_id from users where id = auth.uid()));

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger businesses_updated_at before update on businesses
  for each row execute function update_updated_at();

create trigger users_updated_at before update on users
  for each row execute function update_updated_at();

create trigger leads_updated_at before update on leads
  for each row execute function update_updated_at();

create trigger automations_updated_at before update on automations
  for each row execute function update_updated_at();

create trigger integrations_updated_at before update on integrations
  for each row execute function update_updated_at();
