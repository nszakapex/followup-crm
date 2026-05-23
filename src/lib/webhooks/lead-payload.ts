export type NormalizedLeadPayload = {
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  message: string | null;
  notes: string | null;
  externalCrmName: string;
  externalCrmId: string | null;
  metadata: Record<string, string>;
  eventPayload: Record<string, unknown>;
};

const SAFE_METADATA_KEYS = [
  "campaign",
  "formId",
  "form_id",
  "page",
  "url",
  "pathname",
  "referrer",
];

export function normalizeLeadPayload(payload: unknown): NormalizedLeadPayload | null {
  if (!isRecord(payload)) return null;

  const firstNameInput = readString(payload, ["firstName", "first_name"]);
  const lastNameInput = readString(payload, ["lastName", "last_name"]);
  const fullName = readString(payload, ["fullName", "full_name", "name"]);
  const splitName = splitFullName(fullName);
  const firstName =
    limitString(firstNameInput ?? splitName.firstName ?? "Unknown", 80) ?? "Unknown";
  const lastName = limitString(lastNameInput ?? splitName.lastName, 80);
  const phone = normalizePhone(readString(payload, ["phone", "phone_number", "phoneNumber"]));
  const email = normalizeEmail(readString(payload, ["email", "email_address", "emailAddress"]));
  const source =
    limitString(
      readString(payload, ["source", "form_source", "formSource", "referrer", "page"]) ??
        "Website form",
      120
    ) ?? "Website form";
  const message = limitString(
    readString(payload, ["message", "notes", "inquiry", "comments"]),
    1000
  );
  const metadata = getSafeMetadata(payload);
  const notes = buildNotes(message, metadata);
  const externalCrmId = limitString(
    readString(payload, [
      "external_crm_id",
      "externalCrmId",
      "external_id",
      "externalId",
      "submission_id",
      "submissionId",
      "formSubmissionId",
    ]),
    128
  );
  const externalCrmName =
    limitString(
      readString(payload, ["external_crm_name", "externalCrmName"]),
      80
    ) ?? "Website webhook";

  return {
    firstName,
    lastName,
    phone,
    email,
    source,
    message,
    notes,
    externalCrmName,
    externalCrmId,
    metadata,
    eventPayload: {
      firstName,
      lastName,
      phone,
      email,
      source,
      hasMessage: Boolean(message),
      externalCrmName,
      externalCrmId,
      metadata,
    },
  };
}

export function normalizePhone(value: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const startsWithPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  return limitString(`${startsWithPlus ? "+" : ""}${digits}`, 32);
}

function normalizeEmail(value: string | null): string | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  return normalized ? limitString(normalized, 254) : null;
}

function splitFullName(value: string | null) {
  if (!value) return { firstName: null, lastName: null };

  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };

  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function getSafeMetadata(payload: Record<string, unknown>) {
  const metadata: Record<string, string> = {};
  const nestedMetadata = firstRecord(payload, ["metadata", "meta"]);

  if (nestedMetadata) {
    for (const key of SAFE_METADATA_KEYS) {
      const value = valueToString(nestedMetadata[key]);
      if (value) metadata[normalizeMetadataKey(key)] = limitString(value, 180) ?? value;
    }
  }

  for (const key of SAFE_METADATA_KEYS) {
    const value = valueToString(payload[key]);
    if (value) metadata[normalizeMetadataKey(key)] = limitString(value, 180) ?? value;
  }

  return metadata;
}

function buildNotes(message: string | null, metadata: Record<string, string>) {
  const lines: string[] = [];
  if (message) lines.push(message);

  const sourceDetails = Object.entries(metadata)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

  if (sourceDetails) lines.push(`Source details: ${sourceDetails}`);

  return limitString(lines.join("\n"), 2500);
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = valueToString(record[key]);
    if (value) return value;
  }

  return null;
}

function firstRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) return value;
  }

  return null;
}

function valueToString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function limitString(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeMetadataKey(key: string) {
  if (key === "form_id") return "formId";
  return key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
