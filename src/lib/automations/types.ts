import type { AutomationType } from "@/types/database";

export type AutomationEntityType = "lead" | "review_request" | "message";

export type AutomationAction =
  | "would_send_message"
  | "would_create_review_request"
  | "created_pending_action"
  | "skipped"
  | "failed";

export type AutomationRunResultItem = {
  automationId: string;
  automationType: AutomationType;
  entityType: AutomationEntityType;
  entityId: string;
  action: AutomationAction;
  reason: string;
  duplicatePrevented?: boolean;
};

export type RunAutomationsOptions = {
  businessId: string;
  dryRun?: boolean;
  limit?: number;
  now?: Date;
  allowProviderSends?: boolean;
};

export type RunAutomationsResult =
  | {
      success: true;
      dryRun: boolean;
      businessId: string;
      evaluated: number;
      eligible: number;
      actionsCreated: number;
      skipped: number;
      failures: number;
      duplicatesPrevented: number;
      providerSendsAllowed: boolean;
      deliverySkipped: boolean;
      results: AutomationRunResultItem[];
    }
  | {
      success: false;
      error: string;
      details?: string;
    };
