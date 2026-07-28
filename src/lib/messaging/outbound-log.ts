// Outbound SMS message-log helpers, kept free of "server-only" so tests can
// drive them with an injected client (same pattern as twilio-webhooks.ts).
//
// The insert-before-send ordering here is load-bearing: the messages row must
// be committed BEFORE the provider call so Twilio's status callback (which
// matches rows by provider_message_id) can never race a row that does not
// exist yet. The SID lands in the same update that flips status after the
// provider responds, so a callback can only match once that update committed.

import type { MessageKind } from "@/types/database";

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
};

/**
 * The only message kinds that advance the automated follow-up sequence.
 * Owner alerts and other operational traffic must never appear here - the
 * sequence-step derivation counts outbound rows of exactly these kinds.
 */
export const SEQUENCE_STEP_KINDS = ["first_touch", "followup"] as const;

export type ProviderSendOutcome = {
  status: "queued" | "sent" | "delivered" | "failed" | "mocked";
  providerMessageId?: string | null;
  providerErrorCode?: number | null;
  errorMessage?: string | null;
};

/**
 * Inserts the pending outbound row before any provider call. Returns the row
 * id, or null when the insert failed (callers must abort the send - a message
 * we cannot log is a message we do not send).
 */
export async function insertPendingOutboundSms(
  client: DbClient,
  {
    businessId,
    leadId,
    body,
    provider,
    kind,
  }: {
    businessId: string;
    leadId: string | null;
    body: string;
    provider: string;
    kind: MessageKind | null;
  }
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await client
    .from("messages")
    .insert({
      business_id: businessId,
      lead_id: leadId,
      channel: "sms",
      direction: "outbound",
      body,
      status: "pending",
      provider,
      provider_message_id: null,
      kind,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { id: null, error: error?.message ?? "No message id returned." };
  }

  return { id: data.id as string, error: null };
}

/**
 * Applies the provider result to the pending row: SID, status, and error
 * fields in one update. Status-callback updates key off provider_message_id,
 * which only exists after this commits, so this update cannot clobber a
 * delivery status that arrived "first".
 */
export async function applyProviderOutcomeToOutboundSms(
  client: DbClient,
  messageId: string,
  outcome: ProviderSendOutcome
): Promise<{ error: string | null }> {
  const failed = outcome.status === "failed";
  const status = failed
    ? "failed"
    : outcome.status === "sent" || outcome.status === "delivered"
      ? "sent"
      : "pending";

  const { error } = await client
    .from("messages")
    .update({
      status,
      provider_message_id: outcome.providerMessageId ?? null,
      error_code: outcome.providerErrorCode ?? null,
      error_message: failed
        ? (outcome.errorMessage ?? "SMS delivery failed.")
        : null,
      sent_at: status === "sent" || status === "failed" ? new Date().toISOString() : null,
    })
    .eq("id", messageId);

  return { error: error?.message ?? null };
}
