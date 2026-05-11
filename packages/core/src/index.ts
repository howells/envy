import type { z } from "zod";

/**
 * The four first-class buckets Envy understands when authoring an env schema.
 *
 * `server` and `public` are required by default, `system` is for runtime or
 * provider-owned values, and `optional` permits absence while still validating
 * any provided value.
 */
export type EnvGroupName = "server" | "public" | "system" | "optional";

/**
 * Deployment environments that a provider adapter can target.
 */
export type DeployEnvironment = "development" | "preview" | "production";

/**
 * A Zod schema usable as an environment variable validator.
 */
export type EnvValueSchema = z.ZodType;

/**
 * Per-variable metadata used by CLI, deploy, and lint helpers.
 *
 * The parser only cares about `schema`; metadata exists so the same definition
 * can drive preflight checks and safe provider writes.
 */
export interface EnvVarOptions {
  /**
   * Controls whether this variable participates in deploy checks and pushes.
   *
   * `true` means every deploy environment, `false` means no deploy environment,
   * and an array narrows the variable to the listed deploy environments.
   */
  deploy?: boolean | DeployEnvironment[];
}

/**
 * A Zod schema wrapped with Envy metadata.
 */
export interface EnvVarDefinition<
  TSchema extends EnvValueSchema = EnvValueSchema,
> {
  /**
   * Internal discriminator used to distinguish wrapped entries from raw Zod
   * schemas without relying on library internals.
   */
  readonly kind: "envy.var";
  /** The Zod validator for the raw environment value. */
  readonly schema: TSchema;
  /** Optional metadata consumed by non-parser helpers. */
  readonly options: EnvVarOptions;
}

/**
 * A single variable entry in an Envy schema group.
 */
export type EnvSchemaEntry = EnvValueSchema | EnvVarDefinition;

/**
 * A mapping from environment variable name to validator or metadata wrapper.
 */
export type EnvGroupDefinition = Record<string, EnvSchemaEntry>;

/**
 * The grouped authoring shape accepted by {@link defineEnv}.
 */
export interface EnvDefinition {
  /** Server-only, private variables. Required by default. */
  server?: EnvGroupDefinition;
  /** Client-safe variables. Required by default and prefix-enforced. */
  public?: EnvGroupDefinition;
  /** Runtime or provider-owned variables, excluded from deploy by default. */
  system?: EnvGroupDefinition;
  /** Optional variables. Missing and empty values parse as `undefined`. */
  optional?: EnvGroupDefinition;
}

/**
 * Options that affect parsing and schema validation.
 */
export interface DefineEnvOptions {
  /**
   * Converts `""` to `undefined` before validation.
   *
   * This is enabled by default because `.env` files commonly contain
   * placeholders such as `FOO=`, and Zod defaults should be allowed to apply.
   */
  emptyStringAsUndefined?: boolean;
  /**
   * Required prefix for keys in the `public` group.
   *
   * Defaults to `NEXT_PUBLIC_` because Envy v1 is Next-first.
   */
  publicPrefix?: string;
}

type EntrySchema<TEntry> =
  TEntry extends EnvVarDefinition<infer TSchema>
    ? TSchema
    : TEntry extends EnvValueSchema
      ? TEntry
      : never;

type InferGroup<TGroup> = TGroup extends EnvGroupDefinition
  ? {
      readonly [TKey in keyof TGroup]: z.output<EntrySchema<TGroup[TKey]>>;
    }
  : object;

type InferOptionalGroup<TGroup> = TGroup extends EnvGroupDefinition
  ? {
      readonly [TKey in keyof TGroup]:
        | z.output<EntrySchema<TGroup[TKey]>>
        | undefined;
    }
  : object;

type Simplify<T> = {
  readonly [TKey in keyof T]: T[TKey];
} & {};

/**
 * Parsed values available to server-side code.
 *
 * Server parsing includes public values because server code often needs public
 * URLs and publishable keys too.
 */
export type ServerEnv<TDefinition extends EnvDefinition> = Simplify<
  InferGroup<TDefinition["server"]> &
    InferGroup<TDefinition["public"]> &
    InferGroup<TDefinition["system"]> &
    InferOptionalGroup<TDefinition["optional"]>
>;

/**
 * Parsed values available to client-side code.
 */
export type ClientEnv<TDefinition extends EnvDefinition> = Simplify<
  InferGroup<TDefinition["public"]>
>;

/**
 * Parsed values for non-Next or server-only contexts.
 */
export type ParsedEnv<TDefinition extends EnvDefinition> =
  ServerEnv<TDefinition>;

/**
 * A single validation problem emitted by Envy.
 */
export interface EnvValidationIssue {
  /** The env key that failed validation. */
  readonly key: string;
  /** The group the key belongs to. */
  readonly group: EnvGroupName;
  /** Human-readable validation message. */
  readonly message: string;
  /** Zod issue path rendered from the individual variable schema, if present. */
  readonly path: readonly PropertyKey[];
}

/**
 * Error thrown when an input object does not satisfy an Envy schema.
 */
export class EnvValidationError extends Error {
  /** Structured issues suitable for CLI formatting. */
  readonly issues: readonly EnvValidationIssue[];

  constructor(issues: readonly EnvValidationIssue[]) {
    super(formatValidationMessage(issues));
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/**
 * Runtime representation of a normalized env schema.
 */
export interface EnvSchema<TDefinition extends EnvDefinition> {
  /** Original grouped definition passed to {@link defineEnv}. */
  readonly definition: TDefinition;
  /** Fully resolved parser options. */
  readonly options: Required<DefineEnvOptions>;
  /**
   * Returns a proxy that validates each declared key on first access.
   *
   * Lazy access exists for awkward framework and test environments. Prefer
   * explicit parsing when the application can validate up front.
   */
  lazy(input: Record<string, unknown>): ParsedEnv<TDefinition>;
  /**
   * Parses every group and returns a plain frozen object containing only
   * schema-declared keys.
   */
  parse(input: Record<string, unknown>): ParsedEnv<TDefinition>;
  /**
   * Parses public keys only for client bundles.
   */
  parseClient(input: Record<string, unknown>): ClientEnv<TDefinition>;
  /**
   * Parses server, public, system, and optional keys for server-side code.
   */
  parseServer(input: Record<string, unknown>): ServerEnv<TDefinition>;
}

interface NormalizedEntry {
  readonly group: EnvGroupName;
  readonly key: string;
  readonly options: EnvVarOptions;
  readonly optional: boolean;
  readonly schema: EnvValueSchema;
}

const allGroups = [
  "server",
  "public",
  "system",
  "optional",
] as const satisfies readonly EnvGroupName[];
const clientGroups = ["public"] as const satisfies readonly EnvGroupName[];
const serverGroups = allGroups;

/**
 * Defines a grouped, Zod-powered environment schema.
 *
 * This function performs schema-shape validation immediately, such as public
 * prefix enforcement and duplicate-key detection. Runtime values are validated
 * only when one of the parse methods is called.
 */
export function defineEnv<const TDefinition extends EnvDefinition>(
  definition: TDefinition,
  options: DefineEnvOptions = {},
): EnvSchema<TDefinition> {
  const resolvedOptions = {
    emptyStringAsUndefined: options.emptyStringAsUndefined ?? true,
    publicPrefix: options.publicPrefix ?? "NEXT_PUBLIC_",
  };
  const entries = normalizeDefinition(definition, resolvedOptions);

  return {
    definition,
    options: resolvedOptions,
    lazy(input) {
      return createLazyEnv(
        entries,
        input,
        resolvedOptions,
      ) as ParsedEnv<TDefinition>;
    },
    parse(input) {
      return parseGroups(
        entries,
        input,
        resolvedOptions,
        allGroups,
      ) as ParsedEnv<TDefinition>;
    },
    parseClient(input) {
      return parseGroups(
        entries,
        input,
        resolvedOptions,
        clientGroups,
      ) as ClientEnv<TDefinition>;
    },
    parseServer(input) {
      return parseGroups(
        entries,
        input,
        resolvedOptions,
        serverGroups,
      ) as ServerEnv<TDefinition>;
    },
  };
}

/**
 * Wraps a Zod schema with metadata for deploy and tooling helpers.
 */
function defineVar<TSchema extends EnvValueSchema>(
  schema: TSchema,
  options: EnvVarOptions = {},
): EnvVarDefinition<TSchema> {
  return {
    kind: "envy.var",
    schema,
    options,
  };
}

/**
 * Concise helper for attaching metadata to a variable schema.
 *
 * Raw Zod schemas are accepted directly in every group, so use `v(...)` only
 * when a variable needs non-default metadata such as deploy targeting.
 */
export const v = Object.assign(defineVar, {
  /**
   * Wraps a public variable schema with metadata.
   *
   * The containing `public` group still controls public semantics; this alias is
   * present for API symmetry and future flat-schema support.
   */
  public<TSchema extends EnvValueSchema>(
    schema: TSchema,
    options: EnvVarOptions = {},
  ) {
    return defineVar(schema, options);
  },
  /**
   * Wraps a system variable schema with metadata.
   *
   * The containing `system` group still controls system semantics; this alias is
   * present for API symmetry and future flat-schema support.
   */
  system<TSchema extends EnvValueSchema>(
    schema: TSchema,
    options: EnvVarOptions = {},
  ) {
    return defineVar(schema, options);
  },
  /**
   * Wraps an optional variable schema with metadata.
   *
   * The containing `optional` group still controls optional semantics; this
   * alias is present for API symmetry and future flat-schema support.
   */
  optional<TSchema extends EnvValueSchema>(
    schema: TSchema,
    options: EnvVarOptions = {},
  ) {
    return defineVar(schema, options);
  },
});

function normalizeDefinition(
  definition: EnvDefinition,
  options: Required<DefineEnvOptions>,
): readonly NormalizedEntry[] {
  const entries: NormalizedEntry[] = [];
  const seen = new Map<string, EnvGroupName>();

  for (const group of allGroups) {
    const groupDefinition = definition[group];
    if (!groupDefinition) continue;

    for (const [key, entry] of Object.entries(groupDefinition)) {
      const existingGroup = seen.get(key);
      if (existingGroup) {
        throw new Error(
          `Environment variable ${key} is declared in both ${existingGroup} and ${group}.`,
        );
      }

      if (group === "public" && !key.startsWith(options.publicPrefix)) {
        throw new Error(
          `Public env var ${key} must start with ${options.publicPrefix}.`,
        );
      }

      seen.set(key, group);
      const normalizedEntry = unwrapEntry(entry);
      entries.push({
        group,
        key,
        optional: group === "optional",
        options: normalizedEntry.options,
        schema: normalizedEntry.schema,
      });
    }
  }

  return entries;
}

function unwrapEntry(entry: EnvSchemaEntry): {
  schema: EnvValueSchema;
  options: EnvVarOptions;
} {
  if (isEnvVarDefinition(entry)) {
    return {
      options: entry.options,
      schema: entry.schema,
    };
  }

  return {
    options: {},
    schema: entry,
  };
}

function isEnvVarDefinition(entry: EnvSchemaEntry): entry is EnvVarDefinition {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "kind" in entry &&
    entry.kind === "envy.var"
  );
}

function parseGroups(
  entries: readonly NormalizedEntry[],
  input: Record<string, unknown>,
  options: Required<DefineEnvOptions>,
  groups: readonly EnvGroupName[],
): Readonly<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  const issues: EnvValidationIssue[] = [];
  const includedGroups = new Set(groups);

  for (const entry of entries) {
    if (!includedGroups.has(entry.group)) continue;

    const result = parseEntry(entry, input, options);
    if (result.ok) {
      output[entry.key] = result.value;
      continue;
    }

    issues.push(...result.issues);
  }

  if (issues.length > 0) {
    throw new EnvValidationError(issues);
  }

  return Object.freeze(output);
}

type EntryParseResult =
  | {
      readonly ok: true;
      readonly value: unknown;
    }
  | {
      readonly ok: false;
      readonly issues: readonly EnvValidationIssue[];
    };

function parseEntry(
  entry: NormalizedEntry,
  input: Record<string, unknown>,
  options: Required<DefineEnvOptions>,
): EntryParseResult {
  const rawValue = normalizeRawValue(input[entry.key], options);

  if (entry.optional && rawValue === undefined) {
    return {
      ok: true,
      value: undefined,
    };
  }

  const parsed = entry.schema.safeParse(rawValue);
  if (parsed.success) {
    return {
      ok: true,
      value: parsed.data,
    };
  }

  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      group: entry.group,
      key: entry.key,
      message: issue.message,
      path: issue.path,
    })),
  };
}

function normalizeRawValue(
  value: unknown,
  options: Required<DefineEnvOptions>,
): unknown {
  if (options.emptyStringAsUndefined && value === "") {
    return undefined;
  }

  return value;
}

function createLazyEnv(
  entries: readonly NormalizedEntry[],
  input: Record<string, unknown>,
  options: Required<DefineEnvOptions>,
): Readonly<Record<string, unknown>> {
  const entriesByKey = new Map(entries.map((entry) => [entry.key, entry]));
  const cache = new Map<string, unknown>();

  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        if (prop === "__esModule" || prop === "$$typeof") return undefined;
        if (cache.has(prop)) return cache.get(prop);

        const entry = entriesByKey.get(prop);
        if (!entry) return undefined;

        const result = parseEntry(entry, input, options);
        if (!result.ok) {
          throw new EnvValidationError(result.issues);
        }

        cache.set(prop, result.value);
        return result.value;
      },
      has(_target, prop) {
        return typeof prop === "string" && entriesByKey.has(prop);
      },
      ownKeys() {
        return [...entriesByKey.keys()];
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop !== "string" || !entriesByKey.has(prop))
          return undefined;
        return {
          configurable: true,
          enumerable: true,
        };
      },
    },
  );
}

function formatValidationMessage(
  issues: readonly EnvValidationIssue[],
): string {
  if (issues.length === 1) {
    const issue = issues[0];
    if (!issue) {
      return "Invalid environment variables";
    }
    return `Invalid environment variable ${issue.key}: ${issue.message}`;
  }

  return `Invalid environment variables: ${issues.map((issue) => issue.key).join(", ")}`;
}
