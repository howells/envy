import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import {
  type CliIO,
  type CommandSpec,
  commands,
  helpText,
  outputFormats,
} from "./cli/commands.js";
import {
  parseFlags,
  requireFlags,
  splitAtSeparator,
  wantsJson,
} from "./cli/flags.js";
import { CliUsageError, exitCodes, toCliProblem } from "./cli/problem.js";

export type { CliIO, CliWritable } from "./cli/commands.js";

/**
 * Runs the Envy command-line interface.
 *
 * This is the same implementation used by the `envy` binary. It is exported so
 * tests, custom CLIs, and agent wrappers can call Envy without spawning a child
 * process. Importing this module runs nothing.
 *
 * @param argv - Command arguments without `node` or the script path.
 * @param io - Optional process-like IO for tests and wrappers.
 * @returns Process-style exit code.
 */
export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  io: CliIO = {
    cwd: process.cwd(),
    env: process.env,
    stderr: process.stderr,
    stdout: process.stdout,
  },
): Promise<number> {
  const startedAt = Date.now();
  const [command, subcommand, ...args] = argv;
  const commandName = [command, subcommand].filter(Boolean).join(" ") || "help";
  const envelope = (name: string, body: object) =>
    `${JSON.stringify({
      ...body,
      metadata: {
        command: name,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
    })}\n`;

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    io.stdout.write(helpText);
    return exitCodes.ok;
  }

  if (command === "--version" || command === "-v") {
    io.stdout.write(`${readPackageVersion()}\n`);
    return exitCodes.ok;
  }

  if (command === "describe") {
    io.stdout.write(envelope(commandName, { data: describeCli(), ok: true }));
    return exitCodes.ok;
  }

  const spec = commands.find((candidate) => candidate.name === commandName);
  if (!spec) {
    const problem = new CliUsageError(`Unknown command: ${commandName}`, [
      "Run `envy --help` or `envy describe` to inspect supported commands.",
    ]);
    io.stderr.write(`${problem.text}\n\n`);
    io.stderr.write(helpText);
    return problem.exitCode;
  }

  const { flagArgs } = splitAtSeparator(spec, args);
  if (flagArgs.includes("--help") || flagArgs.includes("-h")) {
    io.stdout.write(helpText);
    return exitCodes.ok;
  }

  const json = accepts(spec, "--json") && wantsJson(flagArgs);

  try {
    const flags = parseFlags(spec, args);
    if (accepts(spec, "--format")) flags.oneOf("format", outputFormats);

    if (flags.has("describe")) {
      io.stdout.write(
        envelope(`${spec.name} --describe`, { data: describeCli(), ok: true }),
      );
      return exitCodes.ok;
    }

    requireFlags(spec, flags);

    const result = await spec.run(flags, io);
    if (typeof result === "number") return result;

    io.stdout.write(
      json
        ? envelope(spec.name, { data: result.data, ok: true })
        : `${result.text}\n`,
    );
    return exitCodes.ok;
  } catch (error) {
    const failure = toCliProblem(error);
    io.stderr.write(
      json
        ? envelope(spec.name, { error: failure.problem, ok: false })
        : `${failure.text}\n`,
    );
    return failure.exitCode;
  }
}

/**
 * Parses dotenv file contents into raw key/value pairs.
 *
 * This is the `dotenv` package's parser, the same one
 * `@howells/envy/dotenv` loads files with, so `envy check local --from`
 * validates the values an app will read. It never appends newlines to values
 * and does not touch `process.env`.
 *
 * @param contents - Raw dotenv file contents.
 * @returns Parsed key/value pairs.
 */
export function parseDotenv(contents: string): Record<string, string> {
  return parse(contents);
}

/**
 * Describes the public `envy` command contract.
 *
 * Use this metadata when an agent, editor integration, or CI wrapper needs
 * command names, flags, output shapes, and exit codes without scraping help
 * text.
 *
 * @returns Machine-readable CLI metadata.
 */
export function describeCli(): Record<string, unknown> {
  return {
    commands: commands.map(({ description, name, options, output }) => ({
      description,
      name,
      options,
      output,
    })),
    exitCodes: {
      "0": "success",
      "64": "usage error",
      "65": "env validation failed",
      "66": "input file could not be read",
      "70": "internal software error",
    },
    name: "envy",
    version: readPackageVersion(),
  };
}

function accepts(spec: CommandSpec, flag: string): boolean {
  return spec.options.some((option) => option.name === flag);
}

/** `package.json` sits one level above this file in both `src` and `dist`. */
function readPackageVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("version" in manifest) ||
    typeof manifest.version !== "string"
  ) {
    throw new Error("package.json has no version string.");
  }
  return manifest.version;
}
