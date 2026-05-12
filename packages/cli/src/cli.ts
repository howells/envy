#!/usr/bin/env node

import { runCli } from "@howells/envy/cli";

process.exitCode = await runCli();
