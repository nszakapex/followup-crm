// A2P message templates. The campaign is APPROVED, so docs/a2p-campaign-copy.md
// is the frozen source of truth: bodies here match the registered samples and
// confirmations verbatim (including the em-dash the samples use - it flips
// encoding to UCS-2, which the registered samples themselves carry, so live
// traffic stays character-consistent with the registration). Rules baked in:
//  - The first business-initiated message identifies the brand AND carries
//    the registered opt-out phrase "Reply STOP to opt out".
//  - No public URL shorteners - carriers filter them.
//  - Merge fields are limited to what the samples represent: [FirstName],
//    [BUSINESS_NAME], [Service], [PHONE], and the review link.
// If copy must change, update the campaign registration first, then here.

export type SmsTemplateVars = {
  businessName: string;
  businessPhone?: string | null;
  firstName?: string | null;
  serviceInterest?: string | null;
  reviewLink?: string | null;
};

const name = (v: SmsTemplateVars) => (v.firstName?.trim() ? ` ${v.firstName.trim()}` : "");
const namedGreeting = (v: SmsTemplateVars) =>
  v.firstName?.trim() ? `, ${v.firstName.trim()}` : "";
const service = (v: SmsTemplateVars) => v.serviceInterest?.trim() || "your request";

/** T+0 after a consented lead arrives. Registered Sample 1. */
export function firstTouch(v: SmsTemplateVars): string {
  return `Hi${name(v)}, this is ${v.businessName} — got your request about ${service(v)}. Want me to send a quote or grab you a time? Reply here${v.businessPhone ? ` or call ${v.businessPhone}` : ""}. Reply STOP to opt out.`;
}

/** ~Day 1, if no reply. Registered Sample 2. */
export function followUpDay1(v: SmsTemplateVars): string {
  return `${v.businessName} here — still happy to help with ${service(v)}. Any questions I can answer, or a day that works best?`;
}

/** ~Day 3, if no reply. Give an easy out; it lowers spam complaints. */
export function followUpDay3(v: SmsTemplateVars): string {
  return `Hi${name(v)}, ${v.businessName} checking in one more time about ${service(v)}. If now's not the right time, no problem — just say "later" and I'll close this out.`;
}

/** ~Day 7 final touch, then the sequence stops. */
export function followUpFinal(v: SmsTemplateVars): string {
  return `${v.businessName}: closing out your ${service(v)} request for now. If you'd still like a quote, reply anytime and we'll pick it back up.`;
}

/** Review request after booked/completed (dispatch stays manual). */
export function reviewRequest(v: SmsTemplateVars): string {
  return `Thanks for choosing ${v.businessName}${namedGreeting(v)}! If we did a good job, a quick review means a lot: ${v.reviewLink ?? "[REVIEW_LINK]"}`;
}

/**
 * HELP response - registered help confirmation (section 5 of the campaign
 * copy). Only used when Advanced Opt-Out is NOT enabled on the Messaging
 * Service; with it enabled, Twilio answers HELP/STOP itself.
 */
export function helpResponse(v: SmsTemplateVars): string {
  return `${v.businessName}: for help, call ${v.businessPhone ?? "the business"}. Msg&data rates may apply. Msg frequency varies. Reply STOP to opt out.`;
}

/** Opt-out confirmation (section 5), same Advanced Opt-Out caveat. */
export function optOutConfirm(v: SmsTemplateVars): string {
  return `${v.businessName}: you've been unsubscribed and will receive no further messages. Reply START to resubscribe.`;
}

/** Opt-in / re-subscribe confirmation (section 4). */
export function optInConfirm(v: SmsTemplateVars): string {
  return `${v.businessName}: you're opted in to updates about your request. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to opt out.`;
}

/**
 * Template-string ({{merge_field}}) variants of the registered copy, used to
 * seed the automations table and as the canonical aligned text migration 011
 * writes into pre-existing rows. Renderers support both snake_case and
 * camelCase merge fields; {{business_phone}} falls back to "us" when the
 * business has no phone on file.
 */
export const FOLLOW_UP_SMS_TEMPLATE_STRINGS = {
  firstTouch:
    "Hi {{first_name}}, this is {{business_name}} — got your request about {{service_interest}}. Want me to send a quote or grab you a time? Reply here or call {{business_phone}}. Reply STOP to opt out.",
  day1: "{{business_name}} here — still happy to help with {{service_interest}}. Any questions I can answer, or a day that works best?",
  day3: 'Hi {{first_name}}, {{business_name}} checking in one more time about {{service_interest}}. If now\'s not the right time, no problem — just say "later" and I\'ll close this out.',
  final:
    "{{business_name}}: closing out your {{service_interest}} request for now. If you'd still like a quote, reply anytime and we'll pick it back up.",
  review:
    "Thanks for choosing {{business_name}}, {{first_name}}! If we did a good job, a quick review means a lot: {{google_review_link}}",
} as const;
