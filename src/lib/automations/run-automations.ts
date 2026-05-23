import "server-only";

import { runAutomationsCore } from "./run-automations-core.mjs";
import type {
  RunAutomationsOptions,
  RunAutomationsResult,
} from "./types";

/**
 * Controlled automation runner for explicit manual/script invocation.
 *
 * This helper does not schedule itself and does not call SMS/email providers.
 * Confirmed runs create internal/test records only, while dry-runs create
 * nothing and report what would happen.
 */
export async function runAutomations(
  options: RunAutomationsOptions
): Promise<RunAutomationsResult> {
  return (await runAutomationsCore(options)) as RunAutomationsResult;
}
