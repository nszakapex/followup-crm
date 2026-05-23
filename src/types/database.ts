export type LeadStatus =
  | "new"
  | "contacted"
  | "needs_reply"
  | "interested"
  | "booked"
  | "completed"
  | "review_requested"
  | "lost";

export type MessageChannel = "sms" | "email" | "manual_note";
export type MessageDirection = "inbound" | "outbound" | "internal";
export type MessageStatus = "pending" | "sent" | "delivered" | "failed" | "received";

export type AutomationType =
  | "instant_lead_reply"
  | "twenty_four_hour_followup"
  | "three_day_followup"
  | "missed_call_textback"
  | "review_request"
  | "weekly_owner_summary";

export type UserRole = "owner" | "manager" | "staff" | "admin";

export type SyncStatus = "not_connected" | "pending" | "synced" | "failed";

export type BrandVoice =
  | "friendly"
  | "professional"
  | "premium"
  | "casual"
  | "direct"
  | "warm";

export type IntegrationProvider =
  | "zapier"
  | "make"
  | "hubspot"
  | "salesforce"
  | "jobber"
  | "housecall_pro"
  | "google_business_profile"
  | "google_calendar"
  | "meta"
  | "stripe"
  | "twilio"
  | "resend";

export type IntegrationStatus = "active" | "inactive" | "error";

export type ReviewRequestStatus = "pending" | "sent" | "clicked" | "completed" | "failed";
export type AutomationActionStatus =
  | "pending_review"
  | "reviewed"
  | "dismissed"
  | "approved_pending_send";

export interface Business {
  id: string;
  name: string;
  industry: string | null;
  owner_name: string;
  owner_email: string;
  owner_phone: string | null;
  website_url: string | null;
  google_review_link: string | null;
  timezone: string;
  brand_voice: BrandVoice;
  business_hours: Record<string, unknown> | null;
  sms_enabled: boolean;
  email_enabled: boolean;
  review_requests_enabled: boolean;
  lead_followup_enabled: boolean;
  privacy_policy_url: string | null;
  terms_url: string | null;
  sms_compliance_status: string;
  twilio_from_number: string | null;
  resend_from_email: string | null;
  webhook_secret: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  business_id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: LeadStatus;
  intent: string | null;
  notes: string | null;
  ai_summary: string | null;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  followup_count: number;
  external_crm_name: string | null;
  external_crm_id: string | null;
  sync_status: SyncStatus;
  opted_out: boolean;
  consent_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  business_id: string;
  lead_id: string;
  channel: MessageChannel;
  direction: MessageDirection;
  body: string;
  status: MessageStatus;
  provider: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  received_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface Automation {
  id: string;
  business_id: string;
  name: string;
  type: AutomationType;
  enabled: boolean;
  delay_hours: number | null;
  trigger_status: LeadStatus | null;
  message_template: string;
  channel: MessageChannel;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationActionRecord {
  id: string;
  business_id: string;
  lead_id: string | null;
  review_request_id: string | null;
  action_type: string;
  status: AutomationActionStatus;
  channel: "sms" | "email" | null;
  title: string;
  summary: string | null;
  suggested_message: string | null;
  reason: string;
  reason_code: string | null;
  source: string;
  run_id: string | null;
  audit_log_id: string | null;
  dedupe_key: string;
  metadata_json: Record<string, unknown>;
  reviewed_at: string | null;
  dismissed_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewRequest {
  id: string;
  business_id: string;
  lead_id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  channel: MessageChannel;
  message_body: string;
  status: ReviewRequestStatus;
  click_token: string | null;
  sent_at: string | null;
  clicked_at: string | null;
  created_at: string;
}

export interface Integration {
  id: string;
  business_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  external_account_id: string | null;
  settings_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEvent {
  id: string;
  business_id: string;
  source: string;
  payload_json: Record<string, unknown>;
  processed: boolean;
  error_message: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  business_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}
