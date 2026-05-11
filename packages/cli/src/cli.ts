#!/usr/bin/env node

import { cliCommands } from "./index.js";

const [command, subcommand] = process.argv.slice(2);
const requestedCommand = [command, subcommand].filter(Boolean).join(" ");

if (
  !requestedCommand ||
  requestedCommand === "help" ||
  command === "--help" ||
  command === "-h"
) {
  console.log("envy");
  console.log("");
  console.log("Commands:");
  for (const cliCommand of cliCommands) {
    console.log(`  ${cliCommand.name.padEnd(16)} ${cliCommand.summary}`);
  }
  process.exit(0);
}

console.error(`envy ${requestedCommand} is not implemented yet.`);
process.exit(1);
