import * as verticals from "./verticals.mjs";

export type BusinessVerticalId = "generic_service_business" | "auto_detailing";

export type WorkflowTemplateKey =
  | "review_request_initial"
  | "review_request_followup_1"
  | "review_request_followup_2"
  | "missed_call_initial"
  | "missed_call_followup_1"
  | "new_lead_initial"
  | "new_lead_followup_1"
  | "stale_lead_checkin"
  | "no_response_followup"
  | "completed_customer_review_nudge"
  | "estimate_followup"
  | "completed_service_satisfaction_check"
  | "ceramic_coating_followup"
  | "maintenance_wash_checkin";

export type BusinessVertical = {
  id: BusinessVerticalId;
  label: string;
  genericLabel: string;
  serviceNouns: string[];
  leadStatusLabels?: Record<string, string>;
  serviceTypes: string[];
  defaultSequences: string[];
  reviewRequestTemplates: Partial<Record<WorkflowTemplateKey, string>>;
  followUpTemplates: Partial<Record<WorkflowTemplateKey, string>>;
  actionReasons?: Partial<Record<WorkflowTemplateKey, string>>;
  demoFixtures?: Record<string, unknown>;
};

export const GENERIC_VERTICAL_ID = verticals.GENERIC_VERTICAL_ID as BusinessVerticalId;
export const AUTO_DETAILING_VERTICAL_ID = verticals.AUTO_DETAILING_VERTICAL_ID as BusinessVerticalId;
export const BUSINESS_VERTICALS = verticals.BUSINESS_VERTICALS as Record<
  BusinessVerticalId,
  BusinessVertical
>;

export function normalizeBusinessVerticalId(value: string | null | undefined) {
  return verticals.normalizeBusinessVerticalId(value) as BusinessVerticalId;
}

export function resolveBusinessVertical(value: string | null | undefined) {
  return verticals.resolveBusinessVertical(value) as BusinessVertical;
}

export function getBusinessVerticalLabel(value: string | null | undefined) {
  return verticals.getBusinessVerticalLabel(value) as string;
}

export function getWorkflowTemplate(
  verticalInput: string | null | undefined,
  templateKey: string | null | undefined
) {
  return verticals.getWorkflowTemplate(verticalInput, templateKey) as string;
}

export function getWorkflowReason(
  verticalInput: string | null | undefined,
  actionType: string | null | undefined,
  fallback?: string
) {
  return verticals.getWorkflowReason(verticalInput, actionType, fallback) as string;
}

export function getAutomationTemplateForBusiness(params: {
  business?: { industry?: string | null } | null;
  automationType?: string | null;
  templateKey?: string | null;
  currentTemplate?: string | null;
}) {
  const getTemplate = verticals.getAutomationTemplateForBusiness as (
    params: Record<string, unknown>
  ) => string;

  return getTemplate(params);
}

export function getBusinessVerticalOptions() {
  return verticals.getBusinessVerticalOptions() as { id: BusinessVerticalId; label: string }[];
}
