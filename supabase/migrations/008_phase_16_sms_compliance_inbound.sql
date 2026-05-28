-- Phase 16: SMS compliance gate and inbound reply foundation.
-- Uses the existing messages table for matched inbound SMS replies.

create index if not exists idx_messages_twilio_provider_message
  on messages(provider, provider_message_id)
  where provider = 'twilio' and provider_message_id is not null;

create index if not exists idx_messages_business_inbound
  on messages(business_id, direction, created_at desc)
  where direction = 'inbound';
