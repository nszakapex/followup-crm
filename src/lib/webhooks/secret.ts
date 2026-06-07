import { timingSafeEqual } from "node:crypto";

export function safeCompareSecret(incoming: string, stored: string) {
  const incomingBuffer = Buffer.from(incoming);
  const storedBuffer = Buffer.from(stored);

  if (incomingBuffer.length !== storedBuffer.length) return false;

  return timingSafeEqual(incomingBuffer, storedBuffer);
}

export function getHeaderOrBearerSecret(request: Request, headerName: string) {
  const headerSecret = request.headers.get(headerName)?.trim();
  if (headerSecret) return headerSecret;

  const authorization = request.headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1]?.trim() || null;
}

export function authorizeSharedSecret({
  request,
  expectedSecret,
  headerName,
  missingConfigurationError,
  invalidSecretError,
}: {
  request: Request;
  expectedSecret: string | null;
  headerName: string;
  missingConfigurationError: string;
  invalidSecretError: string;
}) {
  if (!expectedSecret) {
    return {
      ok: false as const,
      status: 503,
      error: missingConfigurationError,
    };
  }

  const incoming = getHeaderOrBearerSecret(request, headerName);
  if (!incoming || !safeCompareSecret(incoming, expectedSecret)) {
    return {
      ok: false as const,
      status: 401,
      error: invalidSecretError,
    };
  }

  return { ok: true as const };
}
