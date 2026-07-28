import { isSmsProviderSendReady } from "@/lib/messaging/sms-compliance-core";

export function parseAutomationBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "undefined") return fallback;
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }

  return null;
}

/**
 * Provider sends from automation runs stay hard-blocked until the deployment
 * is explicitly flipped live: SMS_ENABLED=true, a real SMS_PROVIDER, and
 * SMS_COMPLIANCE_APPROVED (A2P campaign approved). Before that, requesting
 * allowProviderSends is a 400 exactly as it always was.
 */
export function evaluateProviderSendRequest(
  value: unknown,
  env: Record<string, string | undefined> = process.env
) {
  const allowProviderSends = parseAutomationBoolean(value, false);

  if (allowProviderSends === null) {
    return {
      ok: false as const,
      status: 400,
      requested: false,
      error: "allowProviderSends must be a boolean.",
    };
  }

  if (allowProviderSends) {
    if (!isSmsProviderSendReady(env)) {
      return {
        ok: false as const,
        status: 400,
        requested: true,
        error:
          "Provider sends are not enabled for scheduled automation runs. Set SMS_ENABLED, a real SMS_PROVIDER, and SMS_COMPLIANCE_APPROVED first.",
      };
    }

    return {
      ok: true as const,
      requested: true,
    };
  }

  return {
    ok: true as const,
    requested: false,
  };
}
