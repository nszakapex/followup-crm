-- Phase 3 support: new columns, indexes, and extensions
-- Run this in your Supabase SQL editor after 001_initial_schema.sql

create extension if not exists "pgcrypto";

-- Automations: track last triggered time and count
alter table automations
  add column if not exists last_triggered_at timestamptz,
  add column if not exists trigger_count integer not null default 0;

-- Review requests: click tracking token
alter table review_requests
  add column if not exists click_token text unique default encode(gen_random_bytes(24), 'hex');

-- Messages: error tracking
alter table messages
  add column if not exists error_message text;

-- Businesses: SMS compliance and provider config
alter table businesses
  add column if not exists sms_compliance_status text default 'not_configured',
  add column if not exists twilio_from_number text,
  add column if not exists resend_from_email text;

-- Indexes
create index if not exists idx_automations_last_triggered
  on automations(business_id, last_triggered_at);

create index if not exists idx_review_requests_click_token
  on review_requests(click_token);
