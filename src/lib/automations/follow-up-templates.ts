import "server-only";

import {
  getAutomationTemplateForBusiness,
  getWorkflowTemplate,
} from "@/lib/business-verticals/verticals";

type TemplateLead = {
  first_name: string | null;
  last_name?: string | null;
};

type TemplateBusiness = {
  name: string | null;
  industry?: string | null;
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
  review_request_initial: getWorkflowTemplate("generic_service_business", "review_request_initial"),
  review_request_followup_1: getWorkflowTemplate("generic_service_business", "review_request_followup_1"),
  review_request_followup_2: getWorkflowTemplate("generic_service_business", "review_request_followup_2"),
  missed_call_initial: getWorkflowTemplate("generic_service_business", "missed_call_initial"),
  missed_call_followup_1: getWorkflowTemplate("generic_service_business", "missed_call_followup_1"),
  new_lead_initial: getWorkflowTemplate("generic_service_business", "new_lead_initial"),
  new_lead_followup_1: getWorkflowTemplate("generic_service_business", "new_lead_followup_1"),
  stale_lead_checkin: getWorkflowTemplate("generic_service_business", "stale_lead_checkin"),
  no_response_followup: getWorkflowTemplate("generic_service_business", "no_response_followup"),
  completed_customer_review_nudge: getWorkflowTemplate(
    "generic_service_business",
    "completed_customer_review_nudge"
  ),
};

export function getFollowUpTemplateForBusiness({
  business,
  automationType,
  templateKey,
  currentTemplate,
}: {
  business: TemplateBusiness;
  automationType?: string | null;
  templateKey: FollowUpTemplateKey;
  currentTemplate?: string | null;
}) {
  return getAutomationTemplateForBusiness({
    business,
    automationType,
    templateKey,
    currentTemplate,
  });
}

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
    firstName: lead.first_name?.trim() || "there",
    lastName: lead.last_name?.trim() || "",
    businessName: business.name?.trim() || "our team",
    reviewLink: business.google_review_link?.trim() || "",
  };

  return template.replace(
    /\{\{\s*(first_name|last_name|business_name|google_review_link|firstName|lastName|businessName|reviewLink)\s*\}\}/g,
    (_, key: keyof typeof values) => values[key] || ""
  );
}
