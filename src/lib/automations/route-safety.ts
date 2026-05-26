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

export function evaluateProviderSendRequest(value: unknown) {
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
    return {
      ok: false as const,
      status: 400,
      requested: true,
      error: "Provider sends are not enabled for scheduled automation runs.",
    };
  }

  return {
    ok: true as const,
    requested: false,
  };
}
