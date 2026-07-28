# A2P 10DLC Campaign Copy Pack

Use this to cross-check the campaign before submitting. Twilio support already
said the current campaign looks compliant — so treat this as a diff check, not
a rewrite. The one hard rule: **whatever ships in `src/lib/sms/templates.ts`
must match the sample messages and confirmations registered here.** Reviewers
and carriers compare live traffic against the registered campaign.

Replace `[BUSINESS_NAME]`, `[PHONE]`, `[DOMAIN]` throughout. Written for a
single-business deployment (e.g. the 96 Mobile Detailing config in the README);
each additional business needs its own brand/campaign.

---

## 1. Use case

`Low Volume Mixed` (or `Mixed`) — the campaign sends both
transactional/conversational messages (lead responses, appointment
coordination) and light promotional content (follow-ups, review requests).
Registering as pure "Customer Care" and then sending follow-up nudges is a
mismatch carriers can flag later.

## 2. Campaign description

> [BUSINESS_NAME] sends SMS to customers and prospective customers who submit
> their phone number through our website form or Facebook/Instagram lead form
> and consent to be contacted by text. Messages respond to the customer's
> service inquiry, coordinate quotes and appointment times, send follow-up
> reminders about their open request, and request a service review after a
> completed job. Message frequency varies, typically 1–4 messages per inquiry.
> Customers can opt out at any time by replying STOP.

(States sender, recipient, and why — the three things reviewers look for.)

## 3. Message flow / how end-users consent (CTA field)

> End-users opt in by submitting our website contact form at
> https://[DOMAIN]/contact or our Facebook/Instagram Lead Ads form. Both forms
> require the user to enter their phone number and display the following
> disclosure before submission: "By submitting, you agree to receive SMS from
> [BUSINESS_NAME] about your request. Msg frequency varies. Msg & data rates
> may apply. Reply STOP to opt out, HELP for help. See our privacy policy at
> https://[DOMAIN]/privacy." Consent is collected per-campaign and is not
> shared with or transferred to any third party. Opt-in proof:
> https://[DOMAIN]/sms-opt-in (screenshot of the form showing the disclosure).

Notes:
- Host a screenshot of the form (with the disclosure visible) at a public URL
  and link it. Reviewers must be able to verify opt-in behind gated flows.
- The business website must be live, publicly accessible, and match the brand
  name — unverifiable URLs are one of the most common rejection causes.

## 4. Opt-in keywords and confirmation

Keywords: `START, YES, UNSTOP, OPTIN`

Opt-in confirmation message (register this AND keep it identical to
`optInConfirm` in templates.ts):

> [BUSINESS_NAME]: you're opted in to updates about your request. Msg
> frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to
> opt out.

## 5. Opt-out / help keywords and responses

Opt-out keywords: `STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT`
Help keywords: `HELP, INFO`

Opt-out confirmation:

> [BUSINESS_NAME]: you've been unsubscribed and will receive no further
> messages. Reply START to resubscribe.

Help response:

> [BUSINESS_NAME]: for help, call [PHONE]. Msg&data rates may apply. Msg
> frequency varies. Reply STOP to opt out.

With Advanced Opt-Out enabled on the Messaging Service, paste these into the
Advanced Opt-Out configuration so Twilio's auto-replies match the registration.

## 6. Sample messages

At least one sample must contain the brand name and opt-out language; use
brackets for templated fields; keep them consistent with the description.

Sample 1 (promotional/first touch):

> Hi [FirstName], this is [BUSINESS_NAME] — got your request about
> [Service]. Want me to send a quote or grab you a time? Reply here or call
> [PHONE]. Reply STOP to opt out.

Sample 2 (transactional/follow-up):

> [BUSINESS_NAME] here — still happy to help with [Service]. Any questions I
> can answer, or a day that works best?

## 7. Website requirements checklist

- [ ] Site is live, has real content, and the domain matches the brand name.
- [ ] Contact form shows the SMS consent disclosure from section 3 verbatim,
      including the description/subheading line under the form title, e.g.
      Title: "Get a Free Quote" / Subheading: "Tell us about your vehicle and
      we'll text you back within minutes."
- [ ] Privacy policy page includes, explicitly:
      - "Mobile information and SMS opt-in consent will not be shared with or
        sold to third parties or affiliates for marketing purposes."
      - Message frequency statement ("message frequency varies").
      - "Message and data rates may apply."
      - How to opt out (reply STOP) and get help (reply HELP / call [PHONE]).
- [ ] Terms/privacy nowhere state that consumer data or opt-in info may be
      shared or sold — that wording alone makes a campaign non-compliant.
- [ ] No public URL shorteners anywhere in message copy.

## 8. Meta Lead Ads consent (feeds the webhook's consent fields)

In the Meta Instant Form:
- Add a custom disclaimer with the section-3 disclosure text, or an optional
  checkbox: "I agree to receive SMS from [BUSINESS_NAME] about my request.
  Reply STOP anytime to opt out."
- In the Zapier/Make payload to `/api/webhooks/leads`, pass the consent
  outcome in `metadata` (e.g. `"sms_consent": "granted"`,
  `"sms_consent_source": "meta_lead_form"`), and map it to
  `leads.sms_consent_status = 'opted_in'` in the webhook handler (Task 2 in
  PLAN.md). Leads without recorded consent stay `unknown` and get email-only
  follow-up — the gate enforces this automatically.

## 9. Ongoing obligations

- Honor revocation promptly and by any reasonable means, not just exact
  keywords — current FCC TCPA rules require it. The inbound webhook logs every
  message, so review non-keyword messages that read like opt-outs ("stop
  texting me pls") and suppress those numbers manually until smarter matching
  is added.
- A2P registrations renew annually — calendar a reminder ~11 months out.
- If message content drifts from the registered use case, update the campaign
  first, then the templates.
