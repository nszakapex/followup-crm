#!/usr/bin/env node

import { parseArgs, printResetUsage, resetDemoData } from "./demo-data.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.flags.has("help")) {
  printResetUsage();
  process.exit(0);
}

try {
  const result = await resetDemoData(args);

  if (result.dryRun) {
    console.log("Demo reset dry run passed.");
    console.log(`Business: ${result.business.name} (${result.business.id})`);
    console.log(`Would delete ${result.planned.demoLeadIds.length} demo lead records and reset ${result.planned.resetAutomations.length} automation types.`);
  } else {
    console.log("Demo reset complete.");
    console.log(`Business: ${result.business.name} (${result.business.id})`);
    console.log(`Deleted leads: ${result.deleted.leads}`);
    console.log(`Deleted review requests: ${result.deleted.reviewRequests}`);
    console.log(`Deleted messages: ${result.deleted.messages}`);
    console.log(`Deleted automation actions: ${result.deleted.automationActions}`);
    console.log(`Reset automation types: ${result.deleted.resetAutomations}`);
    console.log(`Deleted seed-created automations: ${result.deleted.deletedSeedCreatedAutomations}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printResetUsage();
  process.exit(1);
}
