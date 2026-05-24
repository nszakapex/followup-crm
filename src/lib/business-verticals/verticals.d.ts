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

export const GENERIC_VERTICAL_ID: "generic_service_business";
export const AUTO_DETAILING_VERTICAL_ID: "auto_detailing";
export const BUSINESS_VERTICALS: Record<BusinessVerticalId, BusinessVertical>;

export function normalizeBusinessVerticalId(value: string | null | undefined): BusinessVerticalId;
export function resolveBusinessVertical(value: string | null | undefined): BusinessVertical;
export function getBusinessVerticalLabel(value: string | null | undefined): string;
export function getWorkflowTemplate(
  verticalInput: string | null | undefined,
  templateKey: string | null | undefined
): string;
export function getWorkflowReason(
  verticalInput: string | null | undefined,
  actionType: string | null | undefined,
  fallback?: string
): string;
export function getAutomationTemplateForBusiness(params: {
  business?: { industry?: string | null } | null;
  automationType?: string | null;
  templateKey?: string | null;
  currentTemplate?: string | null;
}): string;
export function getBusinessVerticalOptions(): { id: BusinessVerticalId; label: string }[];
