export const GENERIC_VERTICAL_ID = "generic_service_business";
export const AUTO_DETAILING_VERTICAL_ID = "auto_detailing";

export const BUSINESS_VERTICALS = {
  [GENERIC_VERTICAL_ID]: {
    id: GENERIC_VERTICAL_ID,
    label: "Generic service business",
    genericLabel: "Service business",
    serviceNouns: [
      "consultation",
      "estimate",
      "appointment",
      "completed service",
      "follow-up",
      "review request",
      "missed call",
      "new inquiry",
    ],
    leadStatusLabels: {
      new: "New inquiry",
      contacted: "Contacted",
      needs_reply: "Needs reply",
      interested: "Interested",
      booked: "Booked",
      completed: "Completed service",
      review_requested: "Review requested",
      lost: "Lost",
    },
    serviceTypes: [
      "consultation",
      "estimate",
      "appointment",
      "completed service",
      "follow-up",
      "review request",
      "missed call",
      "new inquiry",
    ],
    defaultSequences: [
      "new_lead_initial",
      "missed_call_initial",
      "new_lead_followup_1",
      "no_response_followup",
      "review_request_initial",
    ],
    reviewRequestTemplates: {
      review_request_initial:
        "Hi {{firstName}}, thank you for choosing {{businessName}}. If you had a good experience, would you mind leaving us an honest review? {{reviewLink}}",
      completed_customer_review_nudge:
        "Hi {{firstName}}, thank you again for choosing {{businessName}}. If you are willing, an honest review would help others find us: {{reviewLink}}",
      review_request_followup_1:
        "Hi {{firstName}}, just following up on our review request for {{businessName}}. If you have a minute, an honest review would really help. {{reviewLink}}",
      review_request_followup_2:
        "Hi {{firstName}}, one last quick note from {{businessName}}. If you are open to sharing feedback, here is the review link: {{reviewLink}}",
    },
    actionReasons: {
      review_request_initial: "Customer is completed and eligible for an honest review request.",
      missed_call_initial: "Lead appears to be a missed-call inquiry.",
      new_lead_initial: "Lead is new and has not progressed yet.",
      new_lead_followup_1: "Lead needs a polite follow-up after initial contact.",
      no_response_followup: "Lead has not responded after earlier contact.",
    },
    followUpTemplates: {
      new_lead_initial:
        "Hi {{firstName}}, this is {{businessName}}. Thanks for reaching out. What can we help you with?",
      missed_call_initial:
        "Hi {{firstName}}, this is {{businessName}}. Sorry we missed your call. What can we help you with?",
      missed_call_followup_1:
        "Hi {{firstName}}, checking back from {{businessName}} after your missed call. Reply here if you still need help.",
      new_lead_followup_1:
        "Hi {{firstName}}, just checking in from {{businessName}}. Are you still looking for help?",
      stale_lead_checkin:
        "Hi {{firstName}}, this is {{businessName}}. Checking in to see if you still need anything from us.",
      no_response_followup:
        "Hi {{firstName}}, we wanted to follow up once more. If you still need help, just reply here.",
      estimate_followup:
        "Hi {{firstName}}, just following up on your estimate from {{businessName}}. Do you have any questions or want to schedule a time?",
      completed_service_satisfaction_check:
        "Hi {{firstName}}, this is {{businessName}}. Thanks again for choosing us. How did everything turn out?",
    },
    demoFixtures: {
      notes: "Generic service-business fallback. Safe for unknown or unset industries.",
    },
  },
  [AUTO_DETAILING_VERTICAL_ID]: {
    id: AUTO_DETAILING_VERTICAL_ID,
    label: "Auto detailing",
    genericLabel: "Service business",
    serviceNouns: [
      "exterior detail",
      "interior detail",
      "full detail",
      "ceramic coating",
      "paint correction",
      "maintenance wash",
      "fleet/commercial detail",
      "odor removal",
      "pet hair removal",
      "headlight restoration",
      "engine bay cleaning",
      "mobile detailing",
      "quote/estimate request",
      "unknown / needs qualification",
    ],
    leadStatusLabels: {
      new: "New detailing inquiry",
      contacted: "Estimate sent",
      needs_reply: "Needs reply",
      interested: "Interested",
      booked: "Booked detail",
      completed: "Completed detail",
      review_requested: "Review requested",
      lost: "Lost",
    },
    serviceTypes: [
      "exterior detail",
      "interior detail",
      "full detail",
      "ceramic coating",
      "paint correction",
      "maintenance wash",
      "fleet/commercial detail",
      "odor removal",
      "pet hair removal",
      "headlight restoration",
      "engine bay cleaning",
      "mobile detailing",
      "quote/estimate request",
      "unknown / needs qualification",
    ],
    defaultSequences: [
      "new_lead_initial",
      "missed_call_initial",
      "estimate_followup",
      "no_response_followup",
      "review_request_initial",
      "completed_service_satisfaction_check",
      "ceramic_coating_followup",
      "maintenance_wash_checkin",
    ],
    reviewRequestTemplates: {
      review_request_initial:
        "Hi {{firstName}}, thank you for choosing {{businessName}}. If you had a good experience, would you mind leaving us an honest Google review? {{reviewLink}}",
      completed_customer_review_nudge:
        "Hi {{firstName}}, thank you again for choosing {{businessName}}. If you are willing, an honest Google review would really help: {{reviewLink}}",
      review_request_followup_1:
        "Hi {{firstName}}, just following up from {{businessName}} after your detail. If you have a minute, an honest Google review would help us a lot: {{reviewLink}}",
      review_request_followup_2:
        "Hi {{firstName}}, one last quick note from {{businessName}}. If you are open to sharing feedback on your detail, here is the review link: {{reviewLink}}",
    },
    actionReasons: {
      review_request_initial:
        "Completed detailing customer is eligible for an honest Google review request.",
      missed_call_initial: "Lead appears to be a missed-call detailing inquiry.",
      new_lead_initial: "Lead is new and asking about detailing services.",
      new_lead_followup_1: "Lead has a detailing estimate or inquiry that needs a polite follow-up.",
      no_response_followup: "Detailing lead has not responded after earlier contact.",
      completed_service_satisfaction_check:
        "Completed detailing customer is ready for a satisfaction check.",
      ceramic_coating_followup: "Lead asked about ceramic coating and may need package guidance.",
      maintenance_wash_checkin: "Customer may be ready for a maintenance wash check-in.",
    },
    followUpTemplates: {
      new_lead_initial:
        "Hey {{firstName}}, this is {{businessName}}. Thanks for reaching out about detailing. What vehicle are you looking to have detailed, and are you interested in interior, exterior, full detail, or coating work?",
      missed_call_initial:
        "Hey {{firstName}}, this is {{businessName}}. Sorry we missed your call. Are you looking for a detail, quote, or appointment time?",
      missed_call_followup_1:
        "Hey {{firstName}}, checking back from {{businessName}} after your missed call. Reply here if you still need a detailing quote or appointment time.",
      new_lead_followup_1:
        "Hey {{firstName}}, just following up on your detailing estimate. Did you want to get a time on the schedule or have any questions about the package?",
      stale_lead_checkin:
        "Hey {{firstName}}, this is {{businessName}}. Checking in to see if you still need help with detailing or a quote.",
      no_response_followup:
        "Hey {{firstName}}, one more quick follow-up from {{businessName}}. If you still want help with your vehicle, just reply here.",
      estimate_followup:
        "Hey {{firstName}}, just following up on your detailing estimate. Did you want to get a time on the schedule or have any questions about the package?",
      completed_service_satisfaction_check:
        "Hi {{firstName}}, this is {{businessName}}. Thanks again for choosing us for your detail. How did everything turn out?",
      ceramic_coating_followup:
        "Hey {{firstName}}, checking in from {{businessName}} about ceramic coating. Did you want help choosing a coating option or scheduling the prep work?",
      maintenance_wash_checkin:
        "Hey {{firstName}}, this is {{businessName}}. It may be a good time for a maintenance wash. Want to look at openings?",
    },
    demoFixtures: {
      businessName: "Demo Detailing Studio",
      notes: "First beta vertical for manual queue and provider-readiness validation.",
    },
  },
};

const VERTICAL_ALIASES = new Map([
  ["generic", GENERIC_VERTICAL_ID],
  ["service", GENERIC_VERTICAL_ID],
  ["service_business", GENERIC_VERTICAL_ID],
  ["generic_service", GENERIC_VERTICAL_ID],
  ["generic_service_business", GENERIC_VERTICAL_ID],
  ["auto_detailing", AUTO_DETAILING_VERTICAL_ID],
  ["detailing", AUTO_DETAILING_VERTICAL_ID],
  ["auto detailing", AUTO_DETAILING_VERTICAL_ID],
  ["car detailing", AUTO_DETAILING_VERTICAL_ID],
  ["mobile detailing", AUTO_DETAILING_VERTICAL_ID],
  ["detail shop", AUTO_DETAILING_VERTICAL_ID],
]);

const GENERIC_AUTOMATION_TEMPLATE_KEYS = {
  instant_lead_reply: "new_lead_initial",
  missed_call_textback: "missed_call_initial",
  twenty_four_hour_followup: "new_lead_followup_1",
  three_day_followup: "no_response_followup",
  review_request: "review_request_initial",
};

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function templateHasVerticalSignal(verticalId, template) {
  if (verticalId === AUTO_DETAILING_VERTICAL_ID) {
    return /\b(detail|detailing|vehicle|ceramic|coating|paint correction|maintenance wash|package)\b/i.test(
      template
    );
  }

  return false;
}

export function normalizeBusinessVerticalId(value) {
  const normalized = normalize(value);
  if (!normalized) return GENERIC_VERTICAL_ID;

  const direct = VERTICAL_ALIASES.get(normalized);
  if (direct) return direct;

  const underscore = normalized.replace(/\s+/g, "_");
  if (BUSINESS_VERTICALS[underscore]) return underscore;

  if (normalized.includes("detail") || normalized.includes("ceramic coating")) {
    return AUTO_DETAILING_VERTICAL_ID;
  }

  return GENERIC_VERTICAL_ID;
}

export function resolveBusinessVertical(value) {
  return BUSINESS_VERTICALS[normalizeBusinessVerticalId(value)] ?? BUSINESS_VERTICALS[GENERIC_VERTICAL_ID];
}

export function getBusinessVerticalLabel(value) {
  return resolveBusinessVertical(value).label;
}

export function getWorkflowTemplate(verticalInput, templateKey) {
  const vertical = resolveBusinessVertical(verticalInput);
  const generic = BUSINESS_VERTICALS[GENERIC_VERTICAL_ID];

  return (
    vertical.followUpTemplates[templateKey] ||
    vertical.reviewRequestTemplates[templateKey] ||
    generic.followUpTemplates[templateKey] ||
    generic.reviewRequestTemplates[templateKey] ||
    ""
  );
}

export function getWorkflowReason(verticalInput, actionType, fallback) {
  const vertical = resolveBusinessVertical(verticalInput);
  const generic = BUSINESS_VERTICALS[GENERIC_VERTICAL_ID];

  return (
    vertical.actionReasons?.[actionType] ||
    generic.actionReasons?.[actionType] ||
    fallback ||
    "Lead matched the follow-up sequence rules."
  );
}

export function getAutomationTemplateForBusiness({
  business = null,
  automationType = null,
  templateKey = null,
  currentTemplate = null,
} = {}) {
  const vertical = resolveBusinessVertical(business && business.industry);
  const trimmed = String(currentTemplate || "").trim();
  const configuredTemplate = getWorkflowTemplate(vertical.id, templateKey);

  if (vertical.id !== GENERIC_VERTICAL_ID && configuredTemplate) {
    if (!trimmed || !templateHasVerticalSignal(vertical.id, trimmed)) {
      return configuredTemplate;
    }
  }

  if (trimmed) return trimmed;

  const fallbackKey = GENERIC_AUTOMATION_TEMPLATE_KEYS[automationType] || templateKey;
  return getWorkflowTemplate(GENERIC_VERTICAL_ID, fallbackKey);
}

export function getBusinessVerticalOptions() {
  return Object.values(BUSINESS_VERTICALS).map((vertical) => ({
    id: vertical.id,
    label: vertical.label,
  }));
}
