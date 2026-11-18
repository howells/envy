import { parseArgs } from "node:util";
import { CliUsageError } from "./problem.js";

/**
 * One flag a command accepts. The same record is what `envy describe` prints
 * and what the argument parser is configured from.
 */
export interface OptionSpec {
  readonly default?: string;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly name: string;
  readonly repeatable?: true;
  readonly required: boolean;
  readonly type: "boolean" | "path" | "separator" | "string";
}

export interface FlagSpec {
  /** A complete invocation, shown when a required flag is missing. */
  readonly example: string;
  readonly options: readonly OptionSpec[];
}

/** Parsed flags for one command invocation, keyed by flag name without `--`. */
export interface Flags {
  /** Everything after the `--` separator. */
  readonly command: readonly string[];
  /** True when a boolean flag was passed. */
  has(name: string): boolean;
  list(name: string): readonly string[];
  oneOf<TValue extends string>(
    name: string,
    allowed: readonly TValue[],
  ): TValue;
  optional(name: string): string | undefined;
  required(name: string): string;
}

/** Splits a command's arguments at its `--` separator, if it takes one. */
export function splitAtSeparator(
  spec: FlagSpec,
  args: readonly string[],
): { readonly command?: readonly string[]; readonly flagArgs: string[] } {
  if (!spec.options.some((option) => option.type === "separator")) {
    return { flagArgs: [...args] };
  }

  const separatorIndex = args.indexOf("--");
  if (separatorIndex === -1) {
    return { flagArgs: [...args] };
  }

  return {
    command: args.slice(separatorIndex + 1),
    flagArgs: args.slice(0, separatorIndex),
  };
}

/**
 * Parses a command's arguments against its option specs.
 *
 * Required flags are checked separately by {@link requireFlags}, so a command
 * can answer `--describe` without them.
 *
 * @throws {@link CliUsageError} for unknown flags, missing or empty values,
 * unsafe paths, or a missing command after `--`.
 */
export function parseFlags(spec: FlagSpec, args: readonly string[]): Flags {
  const { command, flagArgs } = splitAtSeparator(spec, args);
  const flagOptions = spec.options.filter(
    (option) => option.type !== "separator",
  );

  let values: Record<string, unknown>;
  try {
    values = parseArgs({
      allowPositionals: false,
      args: flagArgs,
      options: Object.fromEntries(
        flagOptions.map((option) => [
          flagKey(option),
          option.type === "boolean"
            ? { type: "boolean" as const }
            : {
                default: option.repeatable ? undefined : option.default,
                multiple: option.repeatable ?? false,
                type: "string" as const,
              },
        ]),
      ),
      strict: true,
    }).values;
  } catch (error) {
    throw new CliUsageError(
      error instanceof Error ? error.message : String(error),
    );
  }

  const list = (name: string): readonly string[] => {
    const value = values[name];
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  };
  const optional = (name: string): string | undefined => {
    const value = values[name];
    return typeof value === "string" ? value : undefined;
  };
  const required = (name: string): string => {
    const value = optional(name);
    if (value === undefined) {
      throw new CliUsageError(`Missing required --${name} option.`, [
        `Run \`envy ${spec.example}\`.`,
      ]);
    }
    return value;
  };

  for (const option of flagOptions) {
    if (option.type === "boolean") continue;
    const key = flagKey(option);
    for (const value of option.repeatable ? list(key) : [optional(key)]) {
      if (value === "") {
        throw new CliUsageError(`Missing value for ${option.name}.`);
      }
      if (value !== undefined && option.type === "path") {
        assertSafePath(option.name, value);
      }
    }
  }

  if (spec.options.some((option) => option.type === "separator")) {
    if (!command) {
      throw new CliUsageError("Missing command separator `--`.", [
        `Run \`envy ${spec.example}\`.`,
      ]);
    }
    if (!command[0]) {
      throw new CliUsageError("Missing command to run after `--`.", [
        "Pass the executable and its arguments after `--`.",
      ]);
    }
  }

  return {
    command: command ?? [],
    has: (name) => values[name] === true,
    list,
    oneOf<TValue extends string>(name: string, allowed: readonly TValue[]) {
      const value = required(name);
      const match = allowed.find((candidate) => candidate === value);
      if (match === undefined) {
        throw new CliUsageError(
          `Invalid --${name} ${value}. Expected one of: ${allowed.join(", ")}.`,
        );
      }
      return match;
    },
    optional,
    required,
  };
}

/** Throws a usage error for the first required flag that was not passed. */
export function requireFlags(spec: FlagSpec, flags: Flags): void {
  for (const option of spec.options) {
    if (option.required && option.type !== "separator") {
      flags.required(flagKey(option));
    }
  }
}

/**
 * True when the arguments ask for JSON. `--json` and `--format` are read in
 * order and the last one wins. Nothing is validated, so this also works on
 * arguments that fail to parse.
 */
export function wantsJson(args: readonly string[]): boolean {
  let json = false;
  for (const [index, arg] of args.entries()) {
    if (arg === "--json") json = true;
    else if (arg === "--format") json = args[index + 1] === "json";
    else if (arg.startsWith("--format=")) json = arg === "--format=json";
  }
  return json;
}

function flagKey(option: OptionSpec): string {
  return option.name.slice(2);
}

function assertSafePath(flag: string, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      throw new CliUsageError(
        `${flag} contains unsupported control characters: ${JSON.stringify(value)}.`,
        [
          "Pass a normal filesystem path without NUL bytes or terminal control characters.",
        ],
      );
    }
  }
}
