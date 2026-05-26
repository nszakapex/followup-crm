import "server-only";

import { validateEnvironment } from "@/lib/env/validation-core";

export function getServerEnvReadiness() {
  return validateEnvironment(process.env, process.env.NODE_ENV);
}
