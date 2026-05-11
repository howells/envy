/**
 * Zod-powered environment parsing for TypeScript applications.
 *
 * The core package is intentionally side-effect free: defining a schema does
 * not read from `process.env`, load dotenv files, or validate anything until a
 * parse method is called. This keeps tests, framework build phases, and CLI
 * tools predictable.
 *
 * @example
 * ```ts
 * import { defineEnv } from "@howells/envy";
 * import { z } from "zod";
 *
 * const envSchema = defineEnv({
 *   server: {
 *     DATABASE_URL: z.string().url(),
 *   },
 *   public: {
 *     NEXT_PUBLIC_APP_URL: z.string().url(),
 *   },
 * });
 *
 * const env = envSchema.parseServer(process.env);
 * ```
 *
 * @module
 */

import type { z } from "zod";

/**
 * The four first-class buckets Envy understands when authoring an env schema.
 *
 * `server` and `public` are required by default, `system` is for runtime or
 * provider-owned values, and `optional` permits absence while still validating
 * any provided value.
 *
 * Group names are part of the public authoring model and are also used in
 * structured validation errors so CLI and editor integrations can explain where
 * a failing key came from.
 */
export type EnvGroupName = "server" | "public" | "system" | "optional";

/**
 * Deployment environments that a provider adapter can target.
 *
 * The parser does not use this directly. It is metadata for future deploy
 * checks and safe provider pushes.
 */
export type DeployEnvironment = "development" | "preview" | "production";

/**
 * A Zod schema usable as an environment variable validator.
 *
 * Envy currently targets Zod directly rather than a schema abstraction layer.
 * This keeps the type model straightforward and lets callers use normal Zod
 * defaults, coercions, transforms, enums, literals, and refinements.
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
 *
 * Most schema entries can be plain Zod schemas. Reach for this wrapper when a
 * key needs extra metadata, such as limiting deploy checks to preview and
 * production.
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
 *
 * Entries may be raw Zod schemas or `v(...)` metadata wrappers. Both parse the
 * same way; metadata is reserved for CLI and provider tooling.
 */
export type EnvSchemaEntry = EnvValueSchema | EnvVarDefinition;

/**
 * A mapping from environment variable name to validator or metadata wrapper.
 */
export type EnvGroupDefinition = Record<string, EnvSchemaEntry>;

/**
 * The grouped authoring shape accepted by {@link defineEnv}.
 *
 * Keys must be unique across all groups. Public keys are prefix-enforced during
 * schema definition so mistakes fail before runtime parsing.
 *
 * @example
 * ```ts
 * defineEnv({
 *   server: { DATABASE_URL: z.string().url() },
 *   public: { NEXT_PUBLIC_APP_URL: z.string().url() },
 *   system: { NODE_ENV: z.string().default("development") },
 *   optional: { SENTRY_DSN: z.string().url() },
 * });
 * ```
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
 *
 * Optional group values are represented as `T | undefined` even when their
 * inner Zod schema is required, because absence is allowed by group semantics.
 */
export type ServerEnv<TDefinition extends EnvDefinition> = Simplify<
  InferGroup<TDefinition["server"]> &
    InferGroup<TDefinition["public"]> &
    InferGroup<TDefinition["system"]> &
    InferOptionalGroup<TDefinition["optional"]>
>;

/**
 * Parsed values available to client-side code.
 *
 * This includes only the `public` group. Server, system, and optional keys are
 * intentionally absent from the client type surface.
 */
export type ClientEnv<TDefinition extends EnvDefinition> = Simplify<
  InferGroup<TDefinition["public"]>
>;

/**
 * Parsed values for non-Next or server-only contexts.
 *
 * This is currently equivalent to {@link ServerEnv}. It exists as a named type
 * because the broad parse API is conceptually different from a framework
 * server/client split.
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
 *
 * The `message` is concise for humans, while {@link EnvValidationError.issues}
 * preserves structured data for test assertions and CLI formatting.
 */
export class EnvValidationError extends Error {
  /** Structured issues suitable for CLI formatting. */
  readonly issues: readonly EnvValidationIssue[];

  /**
   * Creates an error from one or more structured validation issues.
   *
   * @param issues - Problems returned while parsing declared env keys.
   */
  constructor(issues: readonly EnvValidationIssue[]) {
    super(formatValidationMessage(issues));
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/**
 * Runtime representation of a normalized env schema.
 *
 * Instances are created by {@link defineEnv}. They hold the original definition
 * for tooling and expose explicit parse methods for runtime values.
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
   *
   * @param input - Object containing raw env values, usually `process.env`.
   * @returns A typed proxy over declared env keys.
   * @throws {@link EnvValidationError} when an accessed key fails validation.
   */
  lazy(input: Record<string, unknown>): ParsedEnv<TDefinition>;
  /**
   * Parses every group and returns a plain frozen object containing only
   * schema-declared keys.
   *
   * @param input - Object containing raw env values, usually `process.env`.
   * @returns A frozen object containing server, public, system, and optional keys.
   * @throws {@link EnvValidationError} when any included key fails validation.
   */
  parse(input: Record<string, unknown>): ParsedEnv<TDefinition>;
  /**
   * Parses public keys only for client bundles.
   *
   * @param input - Explicit public env mapping. In Next.js this should contain
   * literal `process.env.NEXT_PUBLIC_*` reads so bundling can inline values.
   * @returns A frozen object containing only public keys.
   * @throws {@link EnvValidationError} when any public key fails validation.
   */
  parseClient(input: Record<string, unknown>): ClientEnv<TDefinition>;
  /**
   * Parses server, public, system, and optional keys for server-side code.
   *
   * @param input - Object containing raw env values, usually `process.env`.
   * @returns A frozen object containing all server-side env keys.
   * @throws {@link EnvValidationError} when any server-side key fails validation.
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
 *
 * @param definition - Grouped env variable schema.
 * @param options - Parser and schema-shape options.
 * @returns A schema object with explicit parse methods.
 * @throws Error when public keys do not use the configured prefix or when a key
 * is declared in more than one group.
 *
 * @example
 * ```ts
 * const envSchema = defineEnv({
 *   server: { DATABASE_URL: z.string().url() },
 *   public: { NEXT_PUBLIC_APP_URL: z.string().url() },
 * });
 *
 * const env = envSchema.parseServer(process.env);
 * ```
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
 *
 * This is intentionally not exported directly. Consumers use {@link v}, which
 * exposes the callable wrapper plus semantic aliases.
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
 *
 * @example
 * ```ts
 * const envSchema = defineEnv({
 *   server: {
 *     OPENAI_API_KEY: v(z.string().min(1), {
 *       deploy: ["preview", "production"],
 *     }),
 *   },
 * });
 * ```
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
