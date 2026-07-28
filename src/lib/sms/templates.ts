// A2P-safe message templates. Rules baked in:
//  - The first business-initiated message identifies the brand AND carries
//    "Reply STOP to opt out". Later messages still identify the brand.
//  - No public URL shorteners - carriers filter them.
//  - Bodies aim for one GSM-7 segment (<=160 chars); no smart quotes/emoji,
//    which flip encoding to UCS-2 and cut segments to 70.
//  - These MUST stay consistent with the sample messages and confirmations
//    registered on the A2P campaign (docs/a2p-campaign-copy.md). If you edit
//    copy here, update the campaign first.

export type SmsTemplateVars = {
  businessName: string;
  businessPhone?: string | null;
  firstName?: string | null;
  serviceInterest?: string | null;
  reviewLink?: string | null;
};

const name = (v: SmsTemplateVars) => (v.firstName?.trim() ? ` ${v.firstName.trim()}` : "");
const service = (v: SmsTemplateVars) => v.serviceInterest?.trim() || "your request";

/** T+0 after a consented lead arrives. Brand + STOP required here. */
export function firstTouch(v: SmsTemplateVars): string {
  return `Hi${name(v)}, this is ${v.businessName} - got your request about ${service(v)}. Want me to send a quote or grab you a time? Reply here${v.businessPhone ? ` or call ${v.businessPhone}` : ""}. Reply STOP to opt out.`;
}

/** ~Day 1, if no reply. */
export function followUpDay1(v: SmsTemplateVars): string {
  return `${v.businessName} here - still happy to help with ${service(v)}. Any questions I can answer, or a day that works best?`;
}

/** ~Day 3, if no reply. Give an easy out; it lowers spam complaints. */
export function followUpDay3(v: SmsTemplateVars): string {
  return `Hi${name(v)}, ${v.businessName} checking in one more time about ${service(v)}. If now's not the right time, no problem - just say "later" and I'll close this out.`;
}

/** ~Day 7 final touch, then the sequence stops. */
export function followUpFinal(v: SmsTemplateVars): string {
  return `${v.businessName}: closing out your ${service(v)} request for now. If you'd still like a quote, reply anytime and we'll pick it back up.`;
}

/**
 * HELP response. Only used when Advanced Opt-Out is NOT enabled on the
 * Messaging Service - with it enabled, Twilio answers HELP/STOP itself and
 * the app only records the event.
 */
export function helpResponse(v: SmsTemplateVars): string {
  return `${v.businessName}: for help, call ${v.businessPhone ?? "the business"}. Msg&data rates may apply. Msg frequency varies. Reply STOP to opt out.`;
}

/** Opt-out confirmation, same Advanced Opt-Out caveat as helpResponse. */
export function optOutConfirm(v: SmsTemplateVars): string {
  return `${v.businessName}: you've been unsubscribed and will receive no further messages. Reply START to resubscribe.`;
}

/** Opt-in / re-subscribe confirmation (required for recurring campaigns). */
export function optInConfirm(v: SmsTemplateVars): string {
  return `${v.businessName}: you're opted in to updates about your request. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to opt out.`;
}

/**
 * Template-string variants ({{first_name}} etc.) of the day 1/3/7 follow-up
 * copy, used as A2P-safe defaults for the seeded SMS follow-up automations so
 * automated traffic matches the registered campaign samples.
 */
export const FOLLOW_UP_SMS_TEMPLATE_STRINGS = {
  day1: "{{business_name}} here - still happy to help with {{service_interest}}. Any questions I can answer, or a day that works best?",
  day3: "Hi {{first_name}}, {{business_name}} checking in one more time about {{service_interest}}. If now's not the right time, no problem - just say \"later\" and I'll close this out.",
  final:
    "{{business_name}}: closing out your {{service_interest}} request for now. If you'd still like a quote, reply anytime and we'll pick it back up.",
} as const;
