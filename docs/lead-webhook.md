# Lead Capture Webhook

Use the lead capture webhook to send website form submissions, missed-call tool
events, or automation-tool events into FollowUp CRM.

This is the initial pilot missed-call ingestion path. It is intentionally a
private webhook, not a full phone-provider integration. The route creates or
updates leads only; it does not send SMS, email, review requests, follow-ups, or
provider messages.

## Endpoint

```http
POST /api/webhooks/leads/[businessId]/[secret]
```

Keep the full URL private. The final path segment is the business lead capture secret.

## Example Payload

```json
{
  "fullName": "Sarah Miller",
  "phone": "5550101001",
  "email": "sarah@example.com",
  "source": "Website form",
  "message": "Interested in booking an appointment.",
  "metadata": {
    "page": "/contact",
    "campaign": "google-ads",
    "formId": "homepage-contact"
  }
}
```

## Required Fields

At least one contact method is required:

- `phone`
- `email`

## Supported Field Names

Names:

- `firstName`
- `first_name`
- `lastName`
- `last_name`
- `fullName`
- `full_name`
- `name`

Contact:

- `phone`
- `phone_number`
- `phoneNumber`
- `email`
- `email_address`
- `emailAddress`

Message and source:

- `message`
- `notes`
- `inquiry`
- `comments`
- `source`
- `form_source`
- `formSource`
- `referrer`
- `page`

Metadata:

- `metadata`
- `meta`
- `campaign`
- `formId`
- `form_id`
- `page`
- `url`
- `pathname`

## Responses

Created:

```json
{
  "success": true,
  "leadId": "lead-uuid",
  "created": true,
  "updated": false
}
```

Updated:

```json
{
  "success": true,
  "leadId": "lead-uuid",
  "created": false,
  "updated": true
}
```

Validation error:

```json
{
  "success": false,
  "error": "Lead requires at least a phone number or email."
}
```

Invalid shape:

```json
{
  "success": false,
  "error": "Invalid webhook payload. Send a JSON object with a name, phone or email, and optional source/message fields."
}
```

Invalid secret:

```json
{
  "success": false,
  "error": "Webhook secret is invalid."
}
```

## Duplicate Behavior

The webhook looks for an existing lead in this order:

1. Same business and matching normalized email.
2. Same business and matching normalized phone.
3. Same business and matching external CRM id when provided.

If a match is found, the CRM updates safe fields and preserves progressed lead statuses such as booked, completed, review requested, or lost.

## Security

- Keep the endpoint URL private.
- Do not put the webhook secret in public docs, screenshots, or client-side source code.
- The webhook does not send SMS, email, or review requests.
- The route stores a sanitized payload summary, not the full raw submission.
- The route validates the business id, checks the private secret, rejects oversized
  or invalid JSON payloads, and requires at least one contact destination.
- For public SaaS scale, add provider-specific signatures/rate limiting before
  broad external use.

## Pilot Missed-Call Test

1. Confirm the business has a webhook secret in Settings.
2. Send a POST request with a fake/test phone number and source such as
   `Missed call - pilot test`.
3. Open `/leads` and confirm one lead was created or updated.
4. Repeat the same payload and confirm it updates the same lead instead of
   creating a duplicate.
5. Confirm no review request, SMS, email, or automation provider send occurred.

## Fetch Example

```ts
await fetch("https://your-app.example.com/api/webhooks/leads/[businessId]/[secret]", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    fullName: "Sarah Miller",
    phone: "5550101001",
    email: "sarah@example.com",
    source: "Website form",
    message: "Interested in booking an appointment.",
  }),
});
```

## Curl Example

```bash
curl -X POST "https://your-app.example.com/api/webhooks/leads/[businessId]/[secret]" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Sarah Miller",
    "phone": "5550101001",
    "email": "sarah@example.com",
    "source": "Website form",
    "message": "Interested in booking an appointment."
  }'
```
