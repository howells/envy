import { checkLocal } from "./check-local.js";
import { checkTurbo } from "./check-turbo.js";
import type { FlagSpec, Flags, OptionSpec } from "./flags.js";
import { runLocal } from "./run-local.js";
import { checkModes } from "./schema.js";

/**
 * Process-style output writer accepted by the Envy CLI runner.
 *
 * Tests and wrapper CLIs can pass small in-memory writers here instead of
 * writing to the real process streams.
 */
export interface CliWritable {
  /**
   * Writes CLI output.
   *
   * @param chunk - Text chunk produced by the CLI.
   */
  write(chunk: string): unknown;
}

/**
 * Injectable process-like IO used by `runCli`.
 */
export interface CliIO {
  /** Working directory used to resolve relative schema and env file paths. */
  readonly cwd: string;
  /** Environment object used when a command validates process env directly. */
  readonly env: Record<string, string | undefined>;
  /** Destination for error output and JSON error envelopes. */
  readonly stderr: CliWritable;
  /** Destination for normal output and JSON success envelopes. */
  readonly stdout: CliWritable;
}

/** What a successful check reports: `data` as JSON, `text` otherwise. */
export interface CommandReport {
  readonly data: Readonly<Record<string, unknown>>;
  readonly text: string;
}

/**
 * One `envy` command. Everything but `example` and `run` is the command's
 * public metadata, printed verbatim by `envy describe`.
 */
export interface CommandSpec extends FlagSpec {
  readonly description: string;
  readonly name: string;
  readonly output: Readonly<Record<string, unknown>>;
  /**
   * Runs the command. Returns a report to print, or an exit code when the
   * command owns its own output. Failures are thrown.
   */
  run(flags: Flags, io: CliIO): Promise<CommandReport | number>;
}

export const outputFormats = ["text", "json"] as const;

const schemaOption: OptionSpec = {
  description: "Schema module to import.",
  name: "--schema",
  required: true,
  type: "path",
};

const exportOption: OptionSpec = {
  description:
    "Exported schema name. Defaults to default, envSchema, then schema.",
  name: "--export",
  required: false,
  type: "string",
};

const formatOptions: readonly OptionSpec[] = [
  {
    default: "text",
    enum: outputFormats,
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
];

function modeOption(defaultMode: (typeof checkModes)[number]): OptionSpec {
  return {
    default: defaultMode,
    enum: checkModes,
    name: "--mode",
    required: false,
    type: "string",
  };
}

export const commands: readonly CommandSpec[] = [
  {
    description: "Validate process env or dotenv files against an Envy schema.",
    example: "check local --schema ./src/env/schema.ts --from .env.production",
    name: "check local",
    options: [
      schemaOption,
      exportOption,
      {
        description: "Dotenv file to validate. May be repeated.",
        name: "--from",
        repeatable: true,
        required: false,
        type: "path",
      },
      modeOption("server"),
      ...formatOptions,
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
    run: checkLocal,
  },
  {
    description:
      "Verify schema keys are registered in Turborepo task env or global env.",
    example:
      "check turbo --schema ./src/env/schema.ts --turbo turbo.json --task build",
    name: "check turbo",
    options: [
      schemaOption,
      exportOption,
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
      modeOption("all"),
      ...formatOptions,
    ],
    output: {
      jsonEnvelope: {
        error: "{ ok: false, error: ProblemDetails, metadata }",
        success: "{ ok: true, data: CheckTurboSuccess, metadata }",
      },
    },
    run: checkTurbo,
  },
  {
    description:
      "Validate env, load dotenv files into a subprocess environment, then run a command.",
    example:
      "run local --schema ./env.schema.ts --from .env -- node ./script.js",
    name: "run local",
    options: [
      schemaOption,
      exportOption,
      {
        description:
          "Dotenv file to load. May be repeated; later files override earlier files.",
        name: "--from",
        repeatable: true,
        required: false,
        type: "path",
      },
      modeOption("server"),
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
    run: runLocal,
  },
];

export const helpText = `envy

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
