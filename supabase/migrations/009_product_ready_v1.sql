-- Product-ready v1 CRM lead fields and webhook lookup indexes.

alter table leads
  add column if not exists company text,
  add column if not exists service_interest text,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create index if not exists idx_leads_business_external_source
  on leads(business_id, source, external_crm_id)
  where external_crm_id is not null;

create index if not exists idx_leads_business_external_crm
  on leads(business_id, external_crm_name, external_crm_id)
  where external_crm_id is not null;
