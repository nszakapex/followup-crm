# Lead Capture Webhook

Use the generic lead webhook to send website forms, Meta Lead Ads through
Zapier/Make, missed-call tools, or other simple lead sources into FollowUp CRM.

The endpoint creates or updates leads. It does not send SMS or review requests.
It can send an owner notification email through Resend after the lead is saved.

## Endpoint

```http
POST /api/webhooks/leads
```

Required header:

```http
x-webhook-secret: YOUR_INBOUND_WEBHOOK_SECRET
```

Set `INBOUND_WEBHOOK_SECRET` server-side. For production, also set
`INBOUND_WEBHOOK_BUSINESS_ID` to the Supabase business id that should receive
webhook leads.

## Example Payload

```json
{
  "source": "meta_lead_ads",
  "external_id": "1234567890",
  "name": "Sarah Miller",
  "email": "sarah@example.com",
  "phone": "5550101001",
  "company": "Miller Homes",
  "message": "Interested in booking an appointment.",
  "service_interest": "Initial consultation",
  "metadata": {
    "form_id": "homepage-contact",
    "campaign_name": "spring-campaign",
    "ad_name": "local-lead-ad",
    "preferred_time": "Friday afternoon"
  }
}
```

At least one of `phone` or `email` is required.

## Supported Field Names

Names:

- `firstName`, `first_name`
- `lastName`, `last_name`
- `fullName`, `full_name`, `name`

Contact and business:

- `phone`, `phone_number`, `phoneNumber`
- `email`, `email_address`, `emailAddress`
- `company`, `business`, `organization`

Source and idempotency:

- `source`, `form_source`, `formSource`, `referrer`, `page`
- `external_id`, `externalId`, `submission_id`, `formSubmissionId`
- `external_crm_name`, `externalCrmName`

Interest and message:

- `service_interest`, `serviceInterest`, `interest`
- `service_requested`, `requested_service`
- `message`, `notes`, `inquiry`, `comments`

Metadata:

- `metadata` or `meta`
- custom scalar metadata keys are accepted unless they look secret-like
- keys containing token, secret, password, cookie, authorization, session, or
  API key are ignored

## Responses

Created:

```json
{
  "ok": true,
  "lead_id": "lead-uuid",
  "created": true,
  "duplicate": false
}
```

Duplicate/update:

```json
{
  "ok": true,
  "lead_id": "lead-uuid",
  "created": false,
  "duplicate": true
}
```

Invalid secret:

```json
{
  "ok": false,
  "error": "Webhook secret is invalid."
}
```

## Duplicate Behavior

The webhook looks for an existing lead in this order:

1. Same business, same `source`, and same `external_id`.
2. Same business, same `external_crm_name`, and same external id.
3. Same business and matching normalized email.
4. Same business and matching normalized phone.

If a match is found, the CRM updates safe missing fields, merges notes/metadata,
and preserves progressed terminal statuses such as booked, completed, review
requested, or lost.

## Meta Lead Ads Through Zapier/Make

Recommended v1 flow:

```text
Meta Lead Ads Form -> Zapier/Make trigger -> Webhook POST
-> /api/webhooks/leads -> CRM lead -> Resend notification -> dashboard follow-up
```

Zapier/Make request:

- Method: `POST`
- URL: `https://your-domain.com/api/webhooks/leads`
- Header: `Content-Type: application/json`
- Header: `x-webhook-secret: YOUR_INBOUND_WEBHOOK_SECRET`

Body:

```json
{
  "source": "meta_lead_ads",
  "external_id": "{{lead_id}}",
  "name": "{{full_name}}",
  "email": "{{email}}",
  "phone": "{{phone_number}}",
  "message": "{{message}}",
  "service_interest": "{{service_requested}}",
  "metadata": {
    "form_id": "{{form_id}}",
    "campaign_name": "{{campaign_name}}",
    "ad_name": "{{ad_name}}",
    "city_or_zip": "{{city_or_zip}}",
    "vehicle": "{{vehicle}}",
    "preferred_time": "{{preferred_time}}"
  }
}
```

Direct Meta API integration can be added later. It is not needed for v1.

## Curl Example

```bash
curl -X POST "https://your-app.example.com/api/webhooks/leads" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_INBOUND_WEBHOOK_SECRET" \
  -d '{
    "source": "website_form",
    "external_id": "form-123",
    "name": "Sarah Miller",
    "phone": "5550101001",
    "email": "sarah@example.com",
    "message": "Interested in booking an appointment."
  }'
```

## Verification

Against a running app:

```powershell
npm run test:webhook
```

Manual checks:

1. Send a request with no `x-webhook-secret`; expect `401`.
2. Send a valid test lead; expect `created: true`.
3. Send the same payload again; expect `duplicate: true`.
4. Confirm one lead appears in `/leads`.
5. Confirm an owner notification email is sent or a failure is logged.
