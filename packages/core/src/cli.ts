#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EnvValidationError } from "./index.js";

type CheckMode = "all" | "client" | "server";
type OutputFormat = "json" | "text";

interface CliIO {
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  readonly stderr: Pick<typeof process.stderr, "write">;
  readonly stdout: Pick<typeof process.stdout, "write">;
}

interface CheckLocalOptions {
  readonly exportName?: string;
  readonly format: OutputFormat;
  readonly from: readonly string[];
  readonly mode: CheckMode;
  readonly schemaPath: string;
}

interface CheckSuccess {
  readonly keyCount: number;
  readonly keys: readonly string[];
  readonly mode: CheckMode;
  readonly source: string;
}

interface CliEnvSchema {
  parse(input: Record<string, unknown>): Readonly<Record<string, unknown>>;
  parseClient(
    input: Record<string, unknown>,
  ): Readonly<Record<string, unknown>>;
  parseServer(
    input: Record<string, unknown>,
  ): Readonly<Record<string, unknown>>;
}

const helpText = `envy

Usage:
  envy check local --schema <file> [--from <file>] [--mode server|client|all]

Commands:
  check local   Validate process env or dotenv files against an Envy schema.

Options:
  --schema <file>       Schema module to import. Required for check local.
  --export <name>       Exported schema name. Defaults to default, envSchema, then schema.
  --from <file>         Dotenv file to validate. Repeat to merge several files.
  --mode <mode>         Parse mode: server, client, or all. Default: server.
  --format <format>     Output format: text or json. Default: text.
  -h, --help            Show help.
  -v, --version         Show version.
`;

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
  const [command, subcommand, ...rest] = argv;

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    io.stdout.write(helpText);
    return 0;
  }

  if (command === "--version" || command === "-v") {
    io.stdout.write(`${await readPackageVersion()}\n`);
    return 0;
  }

  if (command === "check" && subcommand === "local") {
    return checkLocal(rest, io);
  }

  io.stderr.write(
    `Unknown command: ${[command, subcommand].filter(Boolean).join(" ")}\n\n`,
  );
  io.stderr.write(helpText);
  return 1;
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

async function checkLocal(args: readonly string[], io: CliIO): Promise<number> {
  let options: CheckLocalOptions | Error;
  try {
    options = parseCheckLocalOptions(args);
  } catch (error) {
    io.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }

  if (options instanceof Error) {
    io.stderr.write(`${options.message}\n`);
    return 1;
  }

  try {
    const schema = await importEnvSchema(options, io.cwd);
    const input = await readInput(options, io);
    const parsed = parseWithMode(schema, input, options.mode);
    const success: CheckSuccess = {
      keyCount: Object.keys(parsed).length,
      keys: Object.keys(parsed).sort(),
      mode: options.mode,
      source: options.from.length > 0 ? options.from.join(", ") : "process.env",
    };

    if (options.format === "json") {
      io.stdout.write(`${JSON.stringify({ ok: true, ...success }, null, 2)}\n`);
      return 0;
    }

    io.stdout.write(
      `Envy local check passed: ${success.keyCount} variable(s) validated from ${success.source}.\n`,
    );
    return 0;
  } catch (error) {
    return reportCheckError(error, options.format, io);
  }
}

function parseCheckLocalOptions(
  args: readonly string[],
): CheckLocalOptions | Error {
  const from: string[] = [];
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

    if (arg === "--schema") {
      schemaPath = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--export") {
      exportName = readFlagValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--from") {
      from.push(readFlagValue(args, index, arg));
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
    return new Error("Missing required --schema <file> option.");
  }

  return {
    exportName,
    format,
    from,
    mode,
    schemaPath,
  };
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

async function importEnvSchema(
  options: CheckLocalOptions,
  cwd: string,
): Promise<CliEnvSchema> {
  const schemaFile = resolve(cwd, options.schemaPath);
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
    throw new Error(
      `Schema module must provide an Envy schema as ${exportHint}.`,
    );
  }

  return schema;
}

async function readInput(
  options: CheckLocalOptions,
  io: CliIO,
): Promise<Record<string, unknown>> {
  if (options.from.length === 0) {
    return { ...io.env };
  }

  const input: Record<string, string> = {};
  for (const fromPath of options.from) {
    const fileContents = await readFile(resolve(io.cwd, fromPath), "utf8");
    Object.assign(input, parseDotenv(fileContents));
  }
  return input;
}

function parseWithMode(
  schema: CliEnvSchema,
  input: Record<string, unknown>,
  mode: CheckMode,
): Readonly<Record<string, unknown>> {
  if (mode === "all") return schema.parse(input);
  if (mode === "client") return schema.parseClient(input);
  return schema.parseServer(input);
}

function reportCheckError(
  error: unknown,
  format: OutputFormat,
  io: CliIO,
): number {
  if (error instanceof EnvValidationError) {
    if (format === "json") {
      io.stdout.write(
        `${JSON.stringify({ issues: error.issues, ok: false }, null, 2)}\n`,
      );
      return 1;
    }

    io.stderr.write(
      `Envy local check failed with ${error.issues.length} issue(s).\n`,
    );
    for (const issue of error.issues) {
      io.stderr.write(`- ${issue.key} [${issue.group}]: ${issue.message}\n`);
    }
    return 1;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (format === "json") {
    io.stdout.write(
      `${JSON.stringify({ error: message, ok: false }, null, 2)}\n`,
    );
    return 1;
  }

  io.stderr.write(`${message}\n`);
  return 1;
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runCli();
}
