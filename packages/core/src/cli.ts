#!/usr/bin/env node

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type EnvDefinition,
  type EnvSchema,
  EnvValidationError,
  listEnvVars,
} from "./index.js";

type CheckMode = "all" | "client" | "server";
type OutputFormat = "json" | "text";
type ExitCode = 0 | 64 | 65 | 66 | 70;

interface ProblemDetails {
  readonly code: string;
  readonly detail?: string;
  readonly docUri: string;
  readonly fields?: readonly {
    readonly message: string;
    readonly path: string;
  }[];
  readonly isRetriable: boolean;
  readonly message: string;
  readonly suggestions: readonly string[];
  readonly title: string;
  readonly type: string;
}

interface EnvelopeMetadata {
  readonly command: string;
  readonly durationMs: number;
  readonly timestamp: string;
}

type JsonEnvelope<TData> =
  | {
      readonly data: TData;
      readonly metadata: EnvelopeMetadata;
      readonly ok: true;
    }
  | {
      readonly error: ProblemDetails;
      readonly metadata: EnvelopeMetadata;
      readonly ok: false;
    };

interface CliIO {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  readonly stderr: Pick<typeof process.stderr, "write">;
  readonly stdout: Pick<typeof process.stdout, "write">;
}

interface CheckLocalOptions {
  readonly describe: boolean;
  readonly exportName?: string;
  readonly format: OutputFormat;
  readonly from: readonly string[];
  readonly mode: CheckMode;
  readonly schemaPath: string;
}

interface CheckTurboOptions {
  readonly exportName?: string;
  readonly format: OutputFormat;
  readonly mode: CheckMode;
  readonly schemaPath: string;
  readonly task: string;
  readonly turboPath: string;
}

interface RunLocalOptions extends CheckLocalOptions {
  readonly command: readonly string[];
}

interface CheckSuccess {
  readonly keyCount: number;
  readonly keys: readonly string[];
  readonly mode: CheckMode;
  readonly sources: readonly string[];
}

interface CheckTurboSuccess {
  readonly keyCount: number;
  readonly keys: readonly string[];
  readonly missing: readonly string[];
  readonly task: string;
  readonly turbo: string;
}

type CliEnvSchema = EnvSchema<EnvDefinition> & {
  parse(input: Record<string, unknown>): Readonly<Record<string, unknown>>;
  parseClient(
    input: Record<string, unknown>,
  ): Readonly<Record<string, unknown>>;
  parseServer(
    input: Record<string, unknown>,
  ): Readonly<Record<string, unknown>>;
};

const helpText = `envy

Usage:
  envy check local --schema <file> [--from <file>] [--mode server|client|all]
  envy check turbo --schema <file> [--turbo turbo.json] [--task build]
  envy run local --schema <file> [--from <file>] [--mode server|client|all] -- <command>
  envy describe

Commands:
  describe      Print machine-readable command metadata.
  check local   Validate process env or dotenv files against an Envy schema.
  check turbo   Verify schema keys are registered in Turborepo task env.
  run local     Validate env, load dotenv files, then run a command.

Options:
  --schema <file>       Schema module to import. Required for check local.
  --export <name>       Exported schema name. Defaults to default, envSchema, then schema.
  --from <file>         Dotenv file to validate. Repeat to merge several files.
  --turbo <file>        Turborepo config to inspect. Defaults to turbo.json.
  --task <name>         Turborepo task to inspect. Defaults to build.
  --mode <mode>         Parse mode: server, client, or all. Default: server.
  --format <format>     Output format: text or json. Default: text.
  --json                Alias for --format json.
  --describe            Print command metadata for check local.
  -h, --help            Show help.
  -v, --version         Show version.
`;

const exitCodes = {
  data: 65,
  input: 66,
  ok: 0,
  software: 70,
  usage: 64,
} as const satisfies Record<string, ExitCode>;

/**
 * Runs the Envy command-line interface.
 *
 * The public binary is intentionally small and explicit. It validates an
 * imported Envy schema against either `process.env` or one or more dotenv files
 * without mutating global environment state.
 *
 * @param argv - Command arguments without the node executable or script path.
 * @param io - Injectable process IO used by tests.
 * @returns Process-style exit code.
 */
export async function runCli(
  argv = process.argv.slice(2),
  io: CliIO = {
    cwd: process.cwd(),
    env: process.env,
    stderr: process.stderr,
    stdout: process.stdout,
  },
): Promise<number> {
  const startedAt = Date.now();
  const [command, subcommand, ...rest] = argv;
  const commandName = [command, subcommand].filter(Boolean).join(" ") || "help";

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
    io.stdout.write(`${await readPackageVersion()}\n`);
    return exitCodes.ok;
  }

  if (command === "describe") {
    writeJson(io.stdout, okEnvelope(describeCli(), commandName, startedAt));
    return exitCodes.ok;
  }

  if (command === "check" && subcommand === "local") {
    return checkLocal(rest, io, startedAt);
  }

  if (command === "check" && subcommand === "turbo") {
    return checkTurbo(rest, io, startedAt);
  }

  if (command === "run" && subcommand === "local") {
    return runLocal(rest, io, startedAt);
  }

  const error = createProblem({
    code: "ENVY_USAGE_UNKNOWN_COMMAND",
    detail: `Unknown command: ${commandName}`,
    message: `Unknown command: ${commandName}`,
    suggestions: [
      "Run `envy --help` or `envy describe` to inspect supported commands.",
    ],
    title: "Unknown command",
  });
  io.stderr.write(`${formatTextError(error)}\n\n`);
  io.stderr.write(helpText);
  return exitCodes.usage;
}

/**
 * Describes the public `envy` command contract.
 *
 * This metadata is intended for agents, CI wrappers, and editor integrations
 * that need to discover available commands, flags, output shapes, and exit
 * codes without scraping human-oriented help text.
 *
 * @returns Machine-readable CLI metadata.
 */
export function describeCli(): Record<string, unknown> {
  return {
    commands: [
      {
        description:
          "Validate process env or dotenv files against an Envy schema.",
        name: "check local",
        options: [
          {
            description: "Schema module to import.",
            name: "--schema",
            required: true,
            type: "path",
          },
          {
            description:
              "Exported schema name. Defaults to default, envSchema, then schema.",
            name: "--export",
            required: false,
            type: "string",
          },
          {
            description: "Dotenv file to validate. May be repeated.",
            name: "--from",
            repeatable: true,
            required: false,
            type: "path",
          },
          {
            default: "server",
            enum: ["server", "client", "all"],
            name: "--mode",
            required: false,
            type: "string",
          },
          {
            enum: ["text", "json"],
            name: "--format",
            required: false,
            type: "string",
          },
          {
            description: "Alias for --format json.",
            name: "--json",
            required: false,
            type: "boolean",
          },
          {
            description: "Print command metadata.",
            name: "--describe",
            required: false,
            type: "boolean",
          },
        ],
        output: {
          jsonEnvelope: {
            error: "{ ok: false, error: ProblemDetails, metadata }",
            success: "{ ok: true, data: CheckSuccess, metadata }",
          },
        },
      },
      {
        description:
          "Verify schema keys are registered in Turborepo task env or global env.",
        name: "check turbo",
        options: [
          {
            description: "Schema module to import.",
            name: "--schema",
            required: true,
            type: "path",
          },
          {
            description:
              "Exported schema name. Defaults to default, envSchema, then schema.",
            name: "--export",
            required: false,
            type: "string",
          },
          {
            default: "turbo.json",
            description: "Turborepo config to inspect.",
            name: "--turbo",
            required: false,
            type: "path",
          },
          {
            default: "build",
            description: "Turborepo task to inspect.",
            name: "--task",
            required: false,
            type: "string",
          },
          {
            default: "all",
            enum: ["server", "client", "all"],
            name: "--mode",
            required: false,
            type: "string",
          },
          {
            enum: ["text", "json"],
            name: "--format",
            required: false,
            type: "string",
          },
          {
            description: "Alias for --format json.",
            name: "--json",
            required: false,
            type: "boolean",
          },
        ],
        output: {
          jsonEnvelope: {
            error: "{ ok: false, error: ProblemDetails, metadata }",
            success: "{ ok: true, data: CheckTurboSuccess, metadata }",
          },
        },
      },
      {
        description:
          "Validate env, load dotenv files into a subprocess environment, then run a command.",
        name: "run local",
        options: [
          {
            description: "Schema module to import.",
            name: "--schema",
            required: true,
            type: "path",
          },
          {
            description:
              "Exported schema name. Defaults to default, envSchema, then schema.",
            name: "--export",
            required: false,
            type: "string",
          },
          {
            description:
              "Dotenv file to load. May be repeated; later files override earlier files.",
            name: "--from",
            repeatable: true,
            required: false,
            type: "path",
          },
          {
            default: "server",
            enum: ["server", "client", "all"],
            name: "--mode",
            required: false,
            type: "string",
          },
          {
            description:
              "Command separator. Everything after this is executed as the child command.",
            name: "--",
            required: true,
            type: "separator",
          },
        ],
        output: {
          success:
            "No Envy output is written on success; stdout and stderr belong to the child process.",
        },
      },
    ],
    exitCodes: {
      "0": "success",
      "64": "usage error",
      "65": "env validation failed",
      "66": "input file could not be read",
      "70": "internal software error",
    },
    name: "envy",
    version: "0.3.5",
  };
}

function okEnvelope<TData>(
  data: TData,
  command: string,
  startedAt: number,
): JsonEnvelope<TData> {
  return {
    data,
    metadata: createMetadata(command, startedAt),
    ok: true,
  };
}

function errorEnvelope(
  error: ProblemDetails,
  command: string,
  startedAt: number,
): JsonEnvelope<never> {
  return {
    error,
    metadata: createMetadata(command, startedAt),
    ok: false,
  };
}

function createMetadata(command: string, startedAt: number): EnvelopeMetadata {
  return {
    command,
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };
}

function writeJson(
  stream: Pick<typeof process.stdout, "write">,
  value: JsonEnvelope<unknown>,
): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function createProblem(input: {
  readonly code: string;
  readonly detail?: string;
  readonly fields?: ProblemDetails["fields"];
  readonly isRetriable?: boolean;
  readonly message: string;
  readonly suggestions?: readonly string[];
  readonly title: string;
}): ProblemDetails {
  return {
    code: input.code,
    detail: input.detail,
    docUri: "https://github.com/howells/envy#cli",
    fields: input.fields,
    isRetriable: input.isRetriable ?? false,
    message: input.message,
    suggestions: input.suggestions ?? [],
    title: input.title,
    type: `https://github.com/howells/envy/errors/${input.code.toLowerCase()}`,
  };
}

function formatTextError(error: ProblemDetails): string {
  const suggestions =
    error.suggestions.length > 0
      ? `\n${error.suggestions.map((suggestion) => `- ${suggestion}`).join("\n")}`
      : "";
  return `${error.title}: ${error.message}${suggestions}`;
}

class CliProblem extends Error {
  readonly exitCode: ExitCode;
  readonly problem: ProblemDetails;

  constructor(exitCode: ExitCode, problem: ProblemDetails) {
    super(problem.message);
    this.name = "CliProblem";
    this.exitCode = exitCode;
    this.problem = problem;
  }
}

class CliUsageError extends CliProblem {
  constructor(message: string, suggestions: readonly string[] = []) {
    super(
      exitCodes.usage,
      createProblem({
        code: "ENVY_USAGE_ERROR",
        message,
        suggestions,
        title: "Usage error",
      }),
    );
  }
}

class CliInputError extends CliProblem {
  constructor(message: string, suggestions: readonly string[] = []) {
    super(
      exitCodes.input,
      createProblem({
        code: "ENVY_INPUT_UNREADABLE",
        message,
        suggestions,
        title: "Input unreadable",
      }),
    );
  }
}

function toPathUsageError(kind: string, value: string): CliUsageError {
  return new CliUsageError(
    `${kind} contains unsupported control characters: ${JSON.stringify(value)}.`,
    [
      "Pass a normal filesystem path without NUL bytes or terminal control characters.",
    ],
  );
}

/**
 * Parses dotenv file contents into a plain object.
 *
 * This parser is deliberately conservative: it supports the syntax teams use in
 * normal `.env` files, never appends newlines to values, and ignores blank lines
 * or comments. It does not mutate `process.env`.
 *
 * @param contents - Raw dotenv file contents.
 * @returns Parsed key/value pairs.
 */
export function parseDotenv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalizedLine = line.startsWith("export ")
      ? line.slice(7).trimStart()
      : line;
    const equalsIndex = normalizedLine.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = normalizedLine.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    values[key] = parseDotenvValue(
      normalizedLine.slice(equalsIndex + 1).trim(),
    );
  }

  return values;
}

async function checkLocal(
  args: readonly string[],
  io: CliIO,
  startedAt: number,
): Promise<number> {
  let options: CheckLocalOptions | Error;
  try {
    options = parseCheckLocalOptions(args);
  } catch (error) {
    const format = wantsJson(args) ? "json" : "text";
    const problem =
      error instanceof CliProblem
        ? error.problem
        : createProblem({
            code: "ENVY_USAGE_ERROR",
            message: error instanceof Error ? error.message : String(error),
            title: "Usage error",
          });
    if (format === "json") {
      writeJson(io.stderr, errorEnvelope(problem, "check local", startedAt));
    } else {
      io.stderr.write(`${formatTextError(problem)}\n`);
    }
    return error instanceof CliProblem ? error.exitCode : exitCodes.usage;
  }

  if (options instanceof CliProblem) {
    if (wantsJson(args)) {
      writeJson(
        io.stderr,
        errorEnvelope(options.problem, "check local", startedAt),
      );
    } else {
      io.stderr.write(`${formatTextError(options.problem)}\n`);
    }
    return options.exitCode;
  }

  if (options instanceof Error) {
    const format = wantsJson(args) ? "json" : "text";
    const problem = createProblem({
      code: "ENVY_USAGE_ERROR",
      message: options.message,
      title: "Usage error",
    });
    if (format === "json") {
      writeJson(io.stderr, errorEnvelope(problem, "check local", startedAt));
    } else {
      io.stderr.write(`${formatTextError(problem)}\n`);
    }
    return exitCodes.usage;
  }

  if (options.describe) {
    writeJson(
      io.stdout,
      okEnvelope(describeCli(), "check local --describe", startedAt),
    );
    return exitCodes.ok;
  }

  try {
    const schema = await importEnvSchema(options, io.cwd);
    const input = await readInput(options, io);
    const parsed = parseWithMode(schema, input, options.mode);
    const success: CheckSuccess = {
      keyCount: Object.keys(parsed).length,
      keys: Object.keys(parsed).sort(),
      mode: options.mode,
      sources: options.from.length > 0 ? options.from : ["process.env"],
    };

    if (options.format === "json") {
      writeJson(io.stdout, okEnvelope(success, "check local", startedAt));
      return exitCodes.ok;
    }

    io.stdout.write(
      `Envy local check passed: ${success.keyCount} variable(s) validated from ${success.sources.join(", ")}.\n`,
    );
    return exitCodes.ok;
  } catch (error) {
    return reportCheckError(error, options.format, io, startedAt);
  }
}

async function checkTurbo(
  args: readonly string[],
  io: CliIO,
  startedAt: number,
): Promise<number> {
  let options: CheckTurboOptions;

  try {
    options = parseCheckTurboOptions(args);
  } catch (error) {
    const format = wantsJson(args) ? "json" : "text";
    const problem =
      error instanceof CliProblem
        ? error.problem
        : createProblem({
            code: "ENVY_USAGE_ERROR",
            message: error instanceof Error ? error.message : String(error),
            title: "Usage error",
          });
    if (format === "json") {
      writeJson(io.stderr, errorEnvelope(problem, "check turbo", startedAt));
    } else {
      io.stderr.write(`${formatTextError(problem)}\n`);
    }
    return error instanceof CliProblem ? error.exitCode : exitCodes.usage;
  }

  try {
    const schema = await importEnvSchema(options, io.cwd);
    const turbo = await readTurboConfig(options, io.cwd);
    const keys = listSchemaKeys(schema, options.mode);
    const registered = getTurboRegisteredEnv(turbo, options.task);
    const missing = keys.filter(
      (key) => !matchesAnyEnvPattern(key, registered),
    );

    if (missing.length > 0) {
      const problem = createProblem({
        code: "ENVY_TURBO_ENV_MISSING",
        fields: missing.map((key) => ({
          message: `Register ${key} in globalEnv or tasks.${options.task}.env.`,
          path: key,
        })),
        message: `${missing.length} schema variable(s) are not registered for Turborepo task ${options.task}.`,
        suggestions: [
          `Add the missing key names or matching wildcard patterns to tasks.${options.task}.env.`,
          "Use globalEnv only for variables that should affect every task hash.",
        ],
        title: "Turborepo env registration missing",
      });

      if (options.format === "json") {
        writeJson(io.stderr, errorEnvelope(problem, "check turbo", startedAt));
      } else {
        io.stderr.write(
          `Envy turbo check failed: ${missing.length} variable(s) missing from ${options.task} env.\n`,
        );
        for (const key of missing) {
          io.stderr.write(`- ${key}\n`);
        }
      }
      return exitCodes.data;
    }

    const success: CheckTurboSuccess = {
      keyCount: keys.length,
      keys,
      missing,
      task: options.task,
      turbo: options.turboPath,
    };

    if (options.format === "json") {
      writeJson(io.stdout, okEnvelope(success, "check turbo", startedAt));
      return exitCodes.ok;
    }

    io.stdout.write(
      `Envy turbo check passed: ${success.keyCount} variable(s) registered for ${options.task}.\n`,
    );
    return exitCodes.ok;
  } catch (error) {
    return reportCheckError(
      error,
      options.format,
      io,
      startedAt,
      "check turbo",
    );
  }
}

async function runLocal(
  args: readonly string[],
  io: CliIO,
  startedAt: number,
): Promise<number> {
  let options: RunLocalOptions;

  try {
    options = parseRunLocalOptions(args);
  } catch (error) {
    const problem =
      error instanceof CliProblem
        ? error.problem
        : createProblem({
            code: "ENVY_USAGE_ERROR",
            message: error instanceof Error ? error.message : String(error),
            title: "Usage error",
          });
    io.stderr.write(`${formatTextError(problem)}\n`);
    return error instanceof CliProblem ? error.exitCode : exitCodes.usage;
  }

  try {
    const schema = await importEnvSchema(options, io.cwd);
    const fileEnv = await readDotenvInput(options, io);
    const childEnv = {
      ...fileEnv,
      ...io.env,
    };
    parseWithMode(schema, childEnv, options.mode);
    return spawnCommand(options.command, childEnv, io);
  } catch (error) {
    return reportCheckError(error, options.format, io, startedAt, "run local");
  }
}

function parseCheckTurboOptions(args: readonly string[]): CheckTurboOptions {
  let exportName: string | undefined;
  let format: OutputFormat = "text";
  let mode: CheckMode = "all";
  let schemaPath: string | undefined;
  let task = "build";
  let turboPath = "turbo.json";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (arg === "--help" || arg === "-h") {
      throw new Error(helpText);
    }

    if (arg === "--json") {
      format = "json";
      continue;
    }

    if (arg === "--schema") {
      schemaPath = readFlagValue(args, index, arg);
      assertSafePath("Schema path", schemaPath);
      index += 1;
      continue;
    }

    if (arg === "--export") {
      exportName = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--turbo") {
      turboPath = readFlagValue(args, index, arg);
      assertSafePath("Turbo config path", turboPath);
      index += 1;
      continue;
    }

    if (arg === "--task") {
      task = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--mode") {
      const value = readFlagValue(args, index, arg);
      if (!isCheckMode(value)) {
        throw new Error(
          `Invalid --mode ${value}. Expected server, client, or all.`,
        );
      }
      mode = value;
      index += 1;
      continue;
    }

    if (arg === "--format") {
      const value = readFlagValue(args, index, arg);
      if (!isOutputFormat(value)) {
        throw new Error(`Invalid --format ${value}. Expected text or json.`);
      }
      format = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!schemaPath) {
    throw new CliUsageError("Missing required --schema <file> option.", [
      "Run `envy check turbo --schema ./src/env/schema.ts --turbo turbo.json --task build`.",
    ]);
  }

  return {
    exportName,
    format,
    mode,
    schemaPath,
    task,
    turboPath,
  };
}

function parseCheckLocalOptions(
  args: readonly string[],
): CheckLocalOptions | Error {
  const from: string[] = [];
  let describe = false;
  let exportName: string | undefined;
  let format: OutputFormat = "text";
  let mode: CheckMode = "server";
  let schemaPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (arg === "--help" || arg === "-h") {
      return new Error(helpText);
    }

    if (arg === "--describe") {
      describe = true;
      continue;
    }

    if (arg === "--json") {
      format = "json";
      continue;
    }

    if (arg === "--schema") {
      schemaPath = readFlagValue(args, index, arg);
      assertSafePath("Schema path", schemaPath);
      index += 1;
      continue;
    }

    if (arg === "--export") {
      exportName = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--from") {
      const fromPath = readFlagValue(args, index, arg);
      assertSafePath("Env file path", fromPath);
      from.push(fromPath);
      index += 1;
      continue;
    }

    if (arg === "--mode") {
      const value = readFlagValue(args, index, arg);
      if (!isCheckMode(value)) {
        return new Error(
          `Invalid --mode ${value}. Expected server, client, or all.`,
        );
      }
      mode = value;
      index += 1;
      continue;
    }

    if (arg === "--format") {
      const value = readFlagValue(args, index, arg);
      if (!isOutputFormat(value)) {
        return new Error(`Invalid --format ${value}. Expected text or json.`);
      }
      format = value;
      index += 1;
      continue;
    }

    return new Error(`Unknown option: ${arg}`);
  }

  if (!schemaPath) {
    if (!describe) {
      return new CliUsageError("Missing required --schema <file> option.", [
        "Run `envy check local --schema ./src/env/schema.ts --from .env.production`.",
      ]);
    }

    schemaPath = "";
  }

  return {
    describe,
    exportName,
    format,
    from,
    mode,
    schemaPath,
  };
}

function parseRunLocalOptions(args: readonly string[]): RunLocalOptions {
  const separatorIndex = args.indexOf("--");
  if (separatorIndex === -1) {
    throw new CliUsageError("Missing command separator `--`.", [
      "Run `envy run local --schema ./env.schema.ts --from .env -- node ./script.js`.",
    ]);
  }

  const command = args.slice(separatorIndex + 1);
  if (command.length === 0 || !command[0]) {
    throw new CliUsageError("Missing command to run after `--`.", [
      "Pass the executable and its arguments after `--`.",
    ]);
  }

  const options = parseCheckLocalOptions(args.slice(0, separatorIndex));
  if (options instanceof Error) {
    throw options;
  }

  if (options.describe) {
    throw new CliUsageError("`--describe` is not supported for run local.", [
      "Use `envy describe` to inspect command metadata.",
    ]);
  }

  if (options.format === "json") {
    throw new CliUsageError("JSON output is not supported for run local.", [
      "Use `envy check local --json` for machine-readable validation output.",
    ]);
  }

  return {
    ...options,
    command,
  };
}

function wantsJson(args: readonly string[]): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") return true;
    if (arg === "--format" && args[index + 1] === "json") return true;
  }

  return false;
}

function readFlagValue(
  args: readonly string[],
  index: number,
  flag: string,
): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function assertSafePath(kind: string, value: string): void {
  if (hasControlCharacter(value)) {
    throw toPathUsageError(kind, value);
  }
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }

  return false;
}

async function importEnvSchema(
  options: Pick<CheckLocalOptions, "exportName" | "schemaPath">,
  cwd: string,
): Promise<CliEnvSchema> {
  const schemaFile = resolve(cwd, options.schemaPath);
  try {
    await access(schemaFile);
  } catch {
    throw new CliInputError(`Schema file could not be read: ${schemaFile}`, [
      "Check the --schema path and make sure the file exists.",
    ]);
  }

  const schemaUrl = `${pathToFileURL(schemaFile).href}?envy=${Date.now()}`;
  const moduleExports = (await import(schemaUrl)) as Record<string, unknown>;
  const schema = options.exportName
    ? moduleExports[options.exportName]
    : (moduleExports.default ??
      moduleExports.envSchema ??
      moduleExports.schema);

  if (!isEnvSchema(schema)) {
    const exportHint = options.exportName
      ? `export named ${options.exportName}`
      : "default export, envSchema export, or schema export";
    throw new CliUsageError(
      `Schema module must provide an Envy schema as ${exportHint}.`,
      ["Export the result of defineEnv(...) from the schema module."],
    );
  }

  return schema;
}

async function readTurboConfig(
  options: CheckTurboOptions,
  cwd: string,
): Promise<Record<string, unknown>> {
  const turboFile = resolve(cwd, options.turboPath);
  let contents: string;
  try {
    contents = await readFile(turboFile, "utf8");
  } catch {
    throw new CliInputError(`Turbo config could not be read: ${turboFile}`, [
      "Check the --turbo path and make sure the file exists.",
    ]);
  }

  try {
    const parsed = JSON.parse(contents) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Turbo config must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new CliUsageError(
      `Turbo config could not be parsed as JSON: ${error instanceof Error ? error.message : String(error)}`,
      ["Pass a valid turbo.json file."],
    );
  }
}

function listSchemaKeys(
  schema: CliEnvSchema,
  mode: CheckMode,
): readonly string[] {
  const groups =
    mode === "client"
      ? (["public"] as const)
      : mode === "server"
        ? (["server", "public", "system", "optional"] as const)
        : undefined;

  return listEnvVars(schema, groups ? { groups } : {})
    .map((entry) => entry.key)
    .sort();
}

function getTurboRegisteredEnv(
  turbo: Record<string, unknown>,
  taskName: string,
): readonly string[] {
  const registered = [
    ...readStringArray(turbo.globalEnv),
    ...readStringArray(readObject(turbo.global)?.env),
  ];
  const task = readObject(readObject(turbo.tasks)?.[taskName]);
  if (!task) {
    throw new CliUsageError(
      `Turbo task ${taskName} was not found in the config.`,
      ["Pass --task with an existing task name."],
    );
  }

  registered.push(...readStringArray(task.env));
  return registered.filter((entry) => !entry.startsWith("!"));
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function matchesAnyEnvPattern(
  key: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => matchesEnvPattern(key, pattern));
}

function matchesEnvPattern(key: string, pattern: string): boolean {
  if (pattern === key) return true;
  if (!pattern.includes("*")) return false;

  const [prefix, ...rest] = pattern.split("*");
  const suffix = rest.join("*");
  return key.startsWith(prefix ?? "") && key.endsWith(suffix);
}

async function readInput(
  options: CheckLocalOptions,
  io: CliIO,
): Promise<Record<string, unknown>> {
  if (options.from.length === 0) {
    return { ...io.env };
  }

  return readDotenvInput(options, io);
}

async function readDotenvInput(
  options: CheckLocalOptions,
  io: CliIO,
): Promise<Record<string, string>> {
  const input: Record<string, string> = {};
  for (const fromPath of options.from) {
    const resolvedPath = resolve(io.cwd, fromPath);
    let fileContents: string;
    try {
      fileContents = await readFile(resolvedPath, "utf8");
    } catch {
      throw new CliInputError(`Env file could not be read: ${resolvedPath}`, [
        "Check the --from path and make sure the file exists.",
      ]);
    }
    Object.assign(input, parseDotenv(fileContents));
  }
  return input;
}

async function spawnCommand(
  command: readonly string[],
  env: Record<string, string | undefined>,
  io: CliIO,
): Promise<number> {
  return new Promise((resolveProcess, reject) => {
    const [executable, ...args] = command;
    if (!executable) {
      reject(
        new CliUsageError("Missing command to run after `--`.", [
          "Pass the executable and its arguments after `--`.",
        ]),
      );
      return;
    }

    const child = spawn(executable, args, {
      cwd: io.cwd,
      env,
      shell: process.platform === "win32",
      stdio: ["inherit", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      io.stdout.write(chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      io.stderr.write(chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      reject(
        new CliInputError(`Command could not be started: ${executable}`, [
          error.message,
        ]),
      );
    });
    child.on("close", (code, signal) => {
      if (signal) {
        resolveProcess(128);
        return;
      }

      resolveProcess(typeof code === "number" ? code : exitCodes.software);
    });
  });
}

function parseWithMode(
  schema: CliEnvSchema,
  input: Record<string, unknown>,
  mode: CheckMode,
): Readonly<Record<string, unknown>> {
  if (mode === "all") {
    return schema.parse(input) as Readonly<Record<string, unknown>>;
  }
  if (mode === "client") {
    return schema.parseClient(input) as Readonly<Record<string, unknown>>;
  }
  return schema.parseServer(input) as Readonly<Record<string, unknown>>;
}

function isEnvValidationError(error: unknown): error is EnvValidationError {
  return (
    error instanceof EnvValidationError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "EnvValidationError" &&
      "issues" in error &&
      Array.isArray(error.issues))
  );
}

function reportCheckError(
  error: unknown,
  format: OutputFormat,
  io: CliIO,
  startedAt: number,
  commandName = "check local",
): number {
  if (isEnvValidationError(error)) {
    const problem = createProblem({
      code: "ENVY_VALIDATION_FAILED",
      fields: error.issues.map((issue) => ({
        message: issue.message,
        path:
          issue.path.length > 0
            ? `${issue.key}.${issue.path.join(".")}`
            : issue.key,
      })),
      message: `Environment validation failed with ${error.issues.length} issue(s).`,
      suggestions: [
        "Set every required schema variable in the checked env source.",
        "Use `--mode client` when validating only public client variables.",
      ],
      title: "Environment validation failed",
    });
    if (format === "json") {
      writeJson(
        io.stderr,
        errorEnvelope(
          {
            ...problem,
            detail: JSON.stringify(error.issues),
          },
          commandName,
          startedAt,
        ),
      );
      return exitCodes.data;
    }

    io.stderr.write(
      `Envy local check failed with ${error.issues.length} issue(s).\n`,
    );
    for (const issue of error.issues) {
      io.stderr.write(`- ${issue.key} [${issue.group}]: ${issue.message}\n`);
    }
    return exitCodes.data;
  }

  if (error instanceof CliProblem) {
    if (format === "json") {
      writeJson(
        io.stderr,
        errorEnvelope(error.problem, commandName, startedAt),
      );
    } else {
      io.stderr.write(`${formatTextError(error.problem)}\n`);
    }
    return error.exitCode;
  }

  const message = error instanceof Error ? error.message : String(error);
  const problem = createProblem({
    code: "ENVY_INTERNAL_ERROR",
    message,
    suggestions: [
      "Re-run with the same inputs. If it persists, open an issue.",
    ],
    title: "Internal error",
  });
  if (format === "json") {
    writeJson(io.stderr, errorEnvelope(problem, commandName, startedAt));
    return exitCodes.software;
  }

  io.stderr.write(`${formatTextError(problem)}\n`);
  return exitCodes.software;
}

function parseDotenvValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replaceAll("\\n", "\n")
      .replaceAll("\\r", "\r")
      .replaceAll('\\"', '"')
      .replaceAll("\\\\", "\\");
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  const commentIndex = value.indexOf(" #");
  return (commentIndex === -1 ? value : value.slice(0, commentIndex)).trimEnd();
}

function isCheckMode(value: string): value is CheckMode {
  return value === "all" || value === "client" || value === "server";
}

function isOutputFormat(value: string): value is OutputFormat {
  return value === "json" || value === "text";
}

function isEnvSchema(value: unknown): value is CliEnvSchema {
  return (
    typeof value === "object" &&
    value !== null &&
    "parse" in value &&
    "parseClient" in value &&
    "parseServer" in value
  );
}

async function readPackageVersion(): Promise<string> {
  try {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown };
    return typeof packageJson.version === "string"
      ? packageJson.version
      : "unknown";
  } catch {
    return "unknown";
  }
}

function isDirectCliExecution(): boolean {
  if (!process.argv[1]) return false;

  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectCliExecution()) {
  process.exitCode = await runCli();
}
