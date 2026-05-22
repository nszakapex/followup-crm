#!/usr/bin/env node

import { parseArgs, printSeedUsage, seedDemoData } from "./demo-data.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.flags.has("help")) {
  printSeedUsage();
  process.exit(0);
}

try {
  const result = await seedDemoData(args);

  if (result.dryRun) {
    console.log("Demo seed dry run passed.");
    console.log(`Business: ${result.business.name} (${result.business.id})`);
    console.log(
      `Would seed ${result.planned.leads} leads, ${result.planned.reviewRequests} review requests, ${result.planned.messages} messages, and ${result.planned.automations} automation activity records.`
    );
  } else {
    console.log("Demo seed complete.");
    console.log(`Business: ${result.business.name} (${result.business.id})`);
    console.log(`Leads: ${result.leads.inserted} inserted, ${result.leads.updated} updated`);
    console.log(
      `Review requests: ${result.reviewRequests.inserted} inserted, ${result.reviewRequests.updated} updated`
    );
    console.log(`Messages: ${result.messages.inserted} inserted, ${result.messages.updated} updated`);
    console.log(
      `Automations: ${result.automations.inserted} inserted, ${result.automations.updated} updated`
    );
    console.log("No SMS or email providers were called.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printSeedUsage();
  process.exit(1);
}
