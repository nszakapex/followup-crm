-- Owner SMS alerts on lead capture. Additive only.

-- 1) Owner alert settings on businesses ---------------------------------------
-- owner_phone already exists in the 001 schema; the IF NOT EXISTS keeps this
-- migration valid for fresh databases built from the bootstrap script too.

alter table businesses
  add column if not exists owner_phone text,
  add column if not exists owner_sms_alerts boolean not null default false;

-- 2) Owner alert rows in the messages log -------------------------------------
-- Inbound texts from the owner's own phone are logged without a lead, so
-- lead_id becomes nullable. Existing rows and all lead-path inserts are
-- unaffected (they always set lead_id).

alter table messages alter column lead_id drop not null;

-- Widen the kind check with 'owner_alert'. The sequence-step derivation
-- whitelists first_touch/followup, so owner alerts can never advance a
-- follow-up sequence (enforced by tests/owner-alerts.test.ts).
alter table messages drop constraint if exists messages_kind_check;
alter table messages add constraint messages_kind_check
  check (
    kind is null
    or kind in ('first_touch', 'followup', 'review_request', 'reply', 'inbound', 'owner_alert')
  );
