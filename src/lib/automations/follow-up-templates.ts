import "server-only";

type TemplateLead = {
  first_name: string | null;
  last_name?: string | null;
};

type TemplateBusiness = {
  name: string | null;
  google_review_link?: string | null;
};

export type FollowUpTemplateKey =
  | "review_request_initial"
  | "review_request_followup_1"
  | "review_request_followup_2"
  | "missed_call_initial"
  | "missed_call_followup_1"
  | "new_lead_initial"
  | "new_lead_followup_1"
  | "stale_lead_checkin"
  | "no_response_followup"
  | "completed_customer_review_nudge";

export const FOLLOW_UP_TEMPLATES: Record<FollowUpTemplateKey, string> = {
  review_request_initial:
    "Hi {{first_name}}, thank you for choosing {{business_name}}. Would you be willing to leave us an honest Google review? {{google_review_link}}",
  review_request_followup_1:
    "Hi {{first_name}}, just following up on our review request for {{business_name}}. If you have a minute, an honest review would really help. {{google_review_link}}",
  review_request_followup_2:
    "Hi {{first_name}}, one last quick note from {{business_name}}. If you are open to sharing feedback, here is the review link: {{google_review_link}}",
  missed_call_initial:
    "Hi {{first_name}}, this is {{business_name}}. Sorry we missed your call. What can we help you with?",
  missed_call_followup_1:
    "Hi {{first_name}}, checking back from {{business_name}} after your missed call. Reply here if you still need help.",
  new_lead_initial:
    "Hi {{first_name}}, this is {{business_name}}. Thanks for reaching out. What can we help you with?",
  new_lead_followup_1:
    "Hi {{first_name}}, just checking in from {{business_name}}. Are you still looking for help?",
  stale_lead_checkin:
    "Hi {{first_name}}, this is {{business_name}}. Checking in to see if you still need anything from us.",
  no_response_followup:
    "Hi {{first_name}}, we wanted to follow up once more. If you still need help, just reply here.",
  completed_customer_review_nudge:
    "Hi {{first_name}}, thank you again for choosing {{business_name}}. If you are willing, an honest review would help others find us: {{google_review_link}}",
};

export function renderFollowUpTemplate(
  template: string,
  business: TemplateBusiness,
  lead: TemplateLead
) {
  const values = {
    first_name: lead.first_name?.trim() || "there",
    last_name: lead.last_name?.trim() || "",
    business_name: business.name?.trim() || "our team",
    google_review_link: business.google_review_link?.trim() || "",
  };

  return template.replace(
    /\{\{\s*(first_name|last_name|business_name|google_review_link)\s*\}\}/g,
    (_, key: keyof typeof values) => values[key] || ""
  );
}
