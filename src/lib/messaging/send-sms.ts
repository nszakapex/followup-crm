import "server-only";

import { createClient } from "@supabase/supabase-js";

import {
  getSmsProviderReadiness,
  isSmsEnabled,
  shouldSkipReviewDelivery,
} from "@/lib/messaging/provider-config";
import {
  evaluateSmsSendGate,
  isTwilioOptOutErrorCode,
  isValidSmsDestination,
  toE164,
  type SmsConsentStatus,
  type SmsKind,
} from "@/lib/messaging/sms-compliance-core";
import type { DeliveryResult } from "@/lib/messaging/types";
import { sendSms as sendSmsViaProvider } from "@/lib/sms";
import type { MessageKind } from "@/types/database";

interface SendSmsParams {
  businessId: string;
  leadId: string;
  to: string | null;
  body: string;
  optedOut: boolean;
  smsFromNumber?: string | null;
  smsComplianceStatus?: string | null;
  /**
   * What this message is in the A2P sequence. Business-initiated kinds
   * require documented opt-in; only "reply" may go out on unknown consent.
   * Defaults to review_request to match this module's original caller.
   */
  kind?: SmsKind;
}

type MessageStatus = "pending" | "sent" | "delivered" | "failed" | "received";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

async function logSmsMessage({
  businessId,
  leadId,
  body,
  status,
  provider,
  providerMessageId = null,
  errorMessage = null,
  kind = null,
  errorCode = null,
}: {
  businessId: string;
  leadId: string;
  body: string;
  status: MessageStatus;
  provider: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  kind?: MessageKind | null;
  errorCode?: number | null;
}) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("messages").insert({
    business_id: businessId,
    lead_id: leadId,
    channel: "sms",
    direction: "outbound",
    body,
    status,
    provider,
    provider_message_id: providerMessageId,
    error_message: errorMessage,
    kind,
    error_code: errorCode,
    sent_at: status === "sent" || status === "failed" ? new Date().toISOString() : null,
  });

  return error;
}

type SmsGateContext = {
  consentStatus: SmsConsentStatus | null;
  optedOut: boolean;
  suppressed: boolean;
  businessTimezone: string | null;
  outboundSequenceCount: number;
  phoneE164: string | null;
};

/**
 * Loads the consent/suppression/timezone context the compliance gate needs.
 * Fails safe: a lookup error reports unknown consent (which blocks
 * business-initiated sends) rather than throwing into the caller.
 */
async function loadSmsGateContext({
  businessId,
  leadId,
  to,
}: {
  businessId: string;
  leadId: string;
  to: string;
}): Promise<SmsGateContext> {
  const supabase = createServiceClient();
  const phoneE164 = toE164(to);

  const context: SmsGateContext = {
    consentStatus: null,
    optedOut: false,
    suppressed: false,
    businessTimezone: null,
    outboundSequenceCount: 0,
    phoneE164,
  };

  try {
    const [leadResult, businessResult, suppressionResult, sequenceResult] = await Promise.all([
      supabase
        .from("leads")
        .select("sms_consent_status, opted_out, phone_e164")
        .eq("id", leadId)
        .eq("business_id", businessId)
        .maybeSingle(),
      supabase.from("businesses").select("timezone").eq("id", businessId).maybeSingle(),
      phoneE164
        ? supabase
            .from("sms_suppressions")
            .select("id")
            .eq("business_id", businessId)
            .eq("phone_e164", phoneE164)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("lead_id", leadId)
        .eq("direction", "outbound")
        .in("kind", ["first_touch", "followup"])
        .in("status", ["pending", "sent", "delivered"]),
    ]);

    if (!leadResult.error && leadResult.data) {
      const record = leadResult.data as {
        sms_consent_status: SmsConsentStatus | null;
        opted_out: boolean | null;
        phone_e164: string | null;
      };
      context.consentStatus = record.sms_consent_status ?? "unknown";
      context.optedOut = Boolean(record.opted_out);
    }

    if (!businessResult.error && businessResult.data) {
      context.businessTimezone =
        (businessResult.data as { timezone: string | null }).timezone ?? null;
    }

    if (!suppressionResult.error && suppressionResult.data) {
      context.suppressed = true;
    }

    if (!sequenceResult.error && typeof sequenceResult.count === "number") {
      context.outboundSequenceCount = sequenceResult.count;
    }
  } catch (error) {
    console.warn("[messaging.sms] SMS gate context lookup failed", {
      businessId,
      leadId,
      error: error instanceof Error ? error.message : "Unknown lookup error",
    });
  }

  return context;
}

/**
 * Twilio error 21610 means the recipient blocked us at the carrier level.
 * Record it as a durable opt-out so we never retry the number.
 */
async function recordCarrierOptOut({
  businessId,
  leadId,
  phoneE164,
}: {
  businessId: string;
  leadId: string;
  phoneE164: string | null;
}) {
  try {
    const supabase = createServiceClient();
    const now = new Date().toISOString();

    await supabase
      .from("leads")
      .update({ opted_out: true, sms_consent_status: "opted_out", sms_opt_out_at: now })
      .eq("id", leadId)
      .eq("business_id", businessId);

    if (phoneE164) {
      await supabase
        .from("sms_suppressions")
        .upsert(
          { business_id: businessId, phone_e164: phoneE164, reason: "carrier_21610" },
          { onConflict: "business_id,phone_e164" }
        );
    }
  } catch (error) {
    console.error("[messaging.sms] Failed to record carrier opt-out", {
      businessId,
      leadId,
      error: error instanceof Error ? error.message : "Unknown opt-out error",
    });
  }
}

function messageLogFailure(provider: DeliveryResult["provider"], message: string): DeliveryResult {
  if (isDevelopment()) {
    console.warn("[messaging.sms] Failed to log SMS message", { message });
  }

  return {
    success: false,
    provider,
    providerMessageId: null,
    error: "Failed to log message.",
    userMessage: "Failed to log message.",
  };
}

/**
 * Sends or records an SMS review request through the selected SMS provider.
 *
 * Test/skip mode is checked before provider configuration and before any
 * network call, so local/demo smoke tests cannot accidentally send real SMS.
 */
export async function sendSms(params: SendSmsParams): Promise<DeliveryResult> {
  const { businessId, leadId, to, body, optedOut, smsFromNumber, smsComplianceStatus } =
    params;
  const kind: SmsKind = params.kind ?? "review_request";
  const messageKind: MessageKind = kind;

  if (!isSmsEnabled()) {
    const userMessage = "SMS is disabled for this deployment.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "disabled",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("blocked", messageError.message);

    return {
      success: false,
      provider: "blocked",
      providerMessageId: null,
      providerStatus: "blocked",
      skipped: true,
      error: userMessage,
      userMessage,
    };
  }

  if (!to) {
    const userMessage = "Customer phone number is required for SMS review requests.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "blocked",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("blocked", messageError.message);

    return {
      success: false,
      provider: "blocked",
      providerMessageId: null,
      providerStatus: "blocked",
      error: userMessage,
      userMessage,
    };
  }

  if (!body.trim()) {
    const userMessage = "Review request message is required.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "blocked",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("blocked", messageError.message);

    return {
      success: false,
      provider: "blocked",
      providerMessageId: null,
      providerStatus: "blocked",
      error: userMessage,
      userMessage,
    };
  }

  if (optedOut) {
    const userMessage = "This customer has opted out of review requests.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "blocked",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("blocked", messageError.message);

    return {
      success: false,
      provider: "blocked",
      providerMessageId: null,
      providerStatus: "blocked",
      skipped: true,
      error: userMessage,
      userMessage,
    };
  }

  if (!isValidSmsDestination(to)) {
    const userMessage = "Customer phone number must be a valid SMS destination.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "blocked",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("blocked", messageError.message);

    return {
      success: false,
      provider: "blocked",
      providerMessageId: null,
      providerStatus: "blocked",
      skipped: true,
      error: userMessage,
      userMessage,
    };
  }

  if (shouldSkipReviewDelivery()) {
    const userMessage = "Review request created. Delivery skipped in test mode.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "pending",
      provider: "test_mode",
    });

    if (messageError) return messageLogFailure("test_mode", messageError.message);

    return {
      success: true,
      provider: "test_mode",
      providerMessageId: null,
      providerStatus: "skipped",
      skipped: true,
      userMessage,
    };
  }

  const readiness = getSmsProviderReadiness(smsFromNumber, smsComplianceStatus);

  if (readiness.provider === "mock") {
    const userMessage = "SMS mock delivery recorded. No live message was sent.";
    const providerResult = await sendSmsViaProvider(
      {
        businessId,
        leadId,
        to,
        body,
      },
      { providerName: "mock" }
    );
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "pending",
      provider: "mock",
      providerMessageId: providerResult.providerMessageId ?? null,
      kind: messageKind,
    });

    if (messageError) return messageLogFailure("mock", messageError.message);

    return {
      success: true,
      provider: "mock",
      providerMessageId: providerResult.providerMessageId ?? null,
      providerStatus: providerResult.status,
      skipped: true,
      userMessage,
    };
  }

  if (!readiness.configured || !readiness.canAttemptLiveSend) {
    const userMessage =
      readiness.reason ??
      (readiness.complianceApproved
        ? "SMS provider is not configured."
        : "SMS compliance approval is not recorded yet. No SMS was sent.");
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "blocked",
      errorMessage: userMessage,
    });

    if (messageError) return messageLogFailure("blocked", messageError.message);

    return {
      success: false,
      provider: "blocked",
      providerMessageId: null,
      providerStatus: "blocked",
      skipped: true,
      error: userMessage,
      userMessage,
    };
  }

  // Live send: run the A2P compliance gate (consent, suppression list,
  // quiet hours, sequence cap). Mock/test modes return earlier above, so
  // pre-launch behavior is unchanged.
  const gateContext = await loadSmsGateContext({ businessId, leadId, to });
  const gate = evaluateSmsSendGate({
    kind,
    consentStatus: gateContext.consentStatus,
    optedOut: optedOut || gateContext.optedOut,
    suppressed: gateContext.suppressed,
    businessTimezone: gateContext.businessTimezone,
    businessSmsComplianceStatus: smsComplianceStatus,
    outboundSequenceCount: gateContext.outboundSequenceCount,
  });

  if (!gate.allowed) {
    const userMessage = `SMS blocked by compliance gate: ${gate.reason}.`;
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: "blocked",
      errorMessage: userMessage,
      kind: messageKind,
    });

    if (messageError) return messageLogFailure("blocked", messageError.message);

    return {
      success: false,
      provider: "blocked",
      providerMessageId: null,
      providerStatus: "blocked",
      skipped: true,
      error: userMessage,
      userMessage,
    };
  }

  const providerResult = await sendSmsViaProvider(
    {
      businessId,
      leadId,
      to,
      from: readiness.sender,
      body,
    },
    { providerName: readiness.provider }
  );

  if (providerResult.status === "failed") {
    const userMessage = "SMS delivery failed.";
    const messageError = await logSmsMessage({
      businessId,
      leadId,
      body,
      status: "failed",
      provider: providerResult.provider,
      providerMessageId: providerResult.providerMessageId ?? null,
      errorMessage: userMessage,
      kind: messageKind,
      errorCode: providerResult.providerErrorCode ?? null,
    });

    if (isTwilioOptOutErrorCode(providerResult.providerErrorCode)) {
      await recordCarrierOptOut({
        businessId,
        leadId,
        phoneE164: gateContext.phoneE164,
      });
    }

    if (messageError) return messageLogFailure(providerResult.provider, messageError.message);

    return {
      success: false,
      provider: providerResult.provider,
      providerMessageId: providerResult.providerMessageId ?? null,
      providerStatus: "failed",
      error: userMessage,
      userMessage,
    };
  }

  const messageStatus =
    providerResult.status === "delivered" || providerResult.status === "sent" ? "sent" : "pending";
  const messageError = await logSmsMessage({
    businessId,
    leadId,
    body,
    status: messageStatus,
    provider: providerResult.provider,
    providerMessageId: providerResult.providerMessageId ?? null,
    kind: messageKind,
  });

  if (messageError) return messageLogFailure(providerResult.provider, messageError.message);

  return {
    success: true,
    provider: providerResult.provider,
    providerMessageId: providerResult.providerMessageId ?? null,
    providerStatus: providerResult.status,
    userMessage: "Review request sent.",
  };
}
