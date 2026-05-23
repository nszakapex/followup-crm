#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAutomationsCore } from "../src/lib/automations/run-automations-core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function loadEnvFile(fileName) {
  const filePath = path.join(repoRoot, fileName);
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;

    const raw = arg.slice(2);
    const [key, ...rest] = raw.split("=");

    if (rest.length === 0) {
      flags.add(key);
    } else {
      values.set(key, rest.join("="));
    }
  }

  return { flags, values };
}

function printUsage() {
  console.log(`Usage:
  npm run automations:run -- --business-id=<uuid> --dry-run
  npm run automations:run -- --business-id=<uuid> --confirm-run

Safety:
  - Defaults to dry-run.
  - Refuses write execution without --confirm-run.
  - Never calls Twilio or Resend in Phase 6.
  - --allow-provider-sends is accepted for future compatibility, but provider sends remain disabled in this runner.
`);
}

function printResult(result) {
  if (!result.success) {
    console.error(result.error);
    if (result.details) console.error(result.details);
    return;
  }

  console.log(result.dryRun ? "Automation dry-run complete." : "Automation run complete.");
  console.log(`Business: ${result.businessId}`);
  console.log(`Evaluated: ${result.evaluated}`);
  console.log(`Eligible: ${result.eligible}`);
  console.log(`Actions created: ${result.actionsCreated}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Duplicates prevented: ${result.duplicatesPrevented}`);
  console.log(`Failures: ${result.failures}`);
  console.log(`Provider sends allowed: ${result.providerSendsAllowed ? "requested" : "no"}`);
  console.log(`Delivery skipped/test mode: ${result.deliverySkipped ? "yes" : "no"}`);

  if (result.results.length > 0) {
    console.log("");
    console.log("Results:");
    for (const item of result.results.slice(0, 25)) {
      const duplicate = item.duplicatePrevented ? " duplicate-prevented" : "";
      console.log(
        `- ${item.automationType} ${item.action}${duplicate}: ${item.reason} (${item.entityType}:${item.entityId})`
      );
    }

    if (result.results.length > 25) {
      console.log(`- ${result.results.length - 25} more result(s) omitted from console output.`);
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const args = parseArgs(process.argv.slice(2));

if (args.flags.has("help")) {
  printUsage();
}

const businessId = args.values.get("business-id");
const confirmRun = args.flags.has("confirm-run");
const dryRun = args.flags.has("dry-run") || !confirmRun;
const allowProviderSends = args.flags.has("allow-provider-sends");
const limit = args.values.has("limit") ? Number(args.values.get("limit")) : undefined;
let shouldRun = !args.flags.has("help");

if (shouldRun && !businessId) {
  printUsage();
  console.error("Business id is required.");
  process.exitCode = 1;
  shouldRun = false;
}

if (shouldRun && !dryRun && !confirmRun) {
  printUsage();
  console.error("Write execution requires --confirm-run.");
  process.exitCode = 1;
  shouldRun = false;
}

if (shouldRun) {
  const result = await runAutomationsCore({
    businessId,
    dryRun,
    limit,
    allowProviderSends,
  });

  printResult(result);

  if (!result.success || result.failures > 0) {
    process.exitCode = 1;
  }
}
