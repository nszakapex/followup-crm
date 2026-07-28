-- Phase 17: A2P SMS follow-up readiness.
-- Adds SMS consent tracking on leads, a phone-level opt-out suppression list
-- that survives lead deletion, sequence/error fields on the existing messages
-- log (which already records channel events; no parallel sms_events table),
-- and the seven-day final follow-up automation type.

-- 1) Consent + normalized phone on leads ------------------------------------

alter table leads
  add column if not exists phone_e164 text,
  add column if not exists sms_consent_status text not null default 'unknown',
  add column if not exists sms_consent_source text,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_opt_out_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_sms_consent_status_check'
  ) then
    alter table leads add constraint leads_sms_consent_status_check
      check (sms_consent_status in ('unknown', 'opted_in', 'opted_out'));
  end if;
end $$;

-- Backfill phone_e164 from the loosely-normalized phone column (US-biased,
-- mirroring toE164 in src/lib/messaging/sms-compliance-core.ts).
update leads
set phone_e164 = case
  when length(regexp_replace(phone, '\D', '', 'g')) = 10
    then '+1' || regexp_replace(phone, '\D', '', 'g')
  when length(regexp_replace(phone, '\D', '', 'g')) = 11
       and regexp_replace(phone, '\D', '', 'g') like '1%'
    then '+' || regexp_replace(phone, '\D', '', 'g')
  when trim(phone) like '+%'
       and length(regexp_replace(phone, '\D', '', 'g')) between 8 and 15
    then '+' || regexp_replace(phone, '\D', '', 'g')
  else null
end
where phone_e164 is null and phone is not null;

-- Leads already marked opted_out keep that as the source of truth.
update leads
set sms_consent_status = 'opted_out',
    sms_opt_out_at = coalesce(sms_opt_out_at, now())
where opted_out = true and sms_consent_status <> 'opted_out';

create index if not exists idx_leads_business_phone_e164
  on leads (business_id, phone_e164)
  where phone_e164 is not null;

-- 2) Sequence + delivery fields on messages ---------------------------------
-- kind drives the stateless follow-up step derivation (count of outbound
-- first_touch/followup rows per lead); error_code stores the carrier error
-- from Twilio status callbacks (e.g. 30034, 21610). Status callbacks update
-- rows by provider/provider_message_id (indexed by migration 008).

alter table messages
  add column if not exists kind text,
  add column if not exists error_code integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_kind_check'
  ) then
    alter table messages add constraint messages_kind_check
      check (
        kind is null
        or kind in ('first_touch', 'followup', 'review_request', 'reply', 'inbound')
      );
  end if;
end $$;

create index if not exists idx_messages_lead_outbound_kind
  on messages (lead_id, kind, created_at desc)
  where direction = 'outbound' and kind is not null;

-- 3) Phone-level suppression list -------------------------------------------
-- Opt-outs must survive lead deletion/re-creation, so they are keyed by
-- normalized phone per business, not by lead row. Checked before every send
-- in addition to the lead's own consent status.

create table if not exists sms_suppressions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  phone_e164 text not null,
  reason text not null default 'stop_keyword', -- stop_keyword | carrier_21610 | manual
  created_at timestamptz not null default now(),
  unique (business_id, phone_e164)
);

alter table sms_suppressions enable row level security;

-- Per-operation policies (003 documented why "for all" policies misbehave).
-- Reads for business members; all writes go through the service-role client
-- (webhooks, send path), which bypasses RLS.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'sms_suppressions' and policyname = 'sms_suppressions_select'
  ) then
    create policy "sms_suppressions_select"
      on sms_suppressions for select
      using (business_id in (select business_id from users where id = auth.uid()));
  end if;
end $$;

-- 4) Seven-day final follow-up automation type ------------------------------
-- Added in this migration; seeded per business by ensureDefaultAutomations.

alter type automation_type add value if not exists 'seven_day_followup';
