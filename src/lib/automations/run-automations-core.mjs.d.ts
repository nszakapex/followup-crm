import type {
  RunAutomationsOptions,
  RunAutomationsResult,
} from "./types";

export function runAutomationsCore(
  options: RunAutomationsOptions
): Promise<RunAutomationsResult>;
