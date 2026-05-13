/**
 * Vercel deployment environment adapter for Envy.
 *
 * The adapter checks remote env presence and pushes schema-declared values
 * through Vercel's HTTP API. It never shells out or writes values through
 * `echo`, which avoids corrupting multiline secrets with trailing newlines.
 *
 * @module
 */

/**
 * Vercel env targets supported by Envy.
 */
export type VercelEnvironment = "development" | "preview" | "production";

/**
 * Vercel adapter configuration.
 */
export interface VercelAdapterOptions {
  /** Fetch implementation used for API calls. Defaults to global `fetch`. */
  readonly fetch?: typeof fetch;
  /** Vercel project id or name. */
  readonly project: string;
  /** Optional Vercel team id. */
  readonly teamId?: string;
  /** Vercel API token. Defaults to `VERCEL_TOKEN`. */
  readonly token?: string;
}

/**
 * Request for checking remote env state.
 */
export interface VercelCheckRequest {
  /** Target Vercel environment. */
  readonly environment: VercelEnvironment;
  /** Schema-declared keys that must exist remotely. */
  readonly keys: readonly string[];
}

/**
 * Request for pushing env values to Vercel.
 */
export interface VercelPushRequest {
  /** Performs validation and reports actions without writing remote state. */
  readonly dryRun?: boolean;
  /** Target Vercel environment. */
  readonly environment: VercelEnvironment;
  /** Allows replacing existing values. Currently unsupported for Vercel API safety. */
  readonly overwrite?: boolean;
  /** Schema-declared values to write. */
  readonly values: Readonly<Record<string, string>>;
}

/**
 * Structured provider check result.
 */
export interface ProviderCheckResult {
  /** Variables present in the provider. */
  readonly present: readonly string[];
  /** Variables missing from the provider. */
  readonly missing: readonly string[];
}

/**
 * Structured provider push result.
 */
export interface ProviderPushResult {
  /** Variables created by the push. */
  readonly created: readonly string[];
  /** Variables skipped because they already existed. */
  readonly skipped: readonly string[];
  /** Whether remote state was left unchanged. */
  readonly dryRun: boolean;
}

/**
 * Deploy adapter returned by {@link vercel}.
 */
export interface VercelDeployAdapter {
  /** Provider name for structured output. */
  readonly name: "vercel";
  /** Checks that schema-declared variables exist in Vercel. */
  check(request: VercelCheckRequest): Promise<ProviderCheckResult>;
  /** Pushes schema-declared values to Vercel without printing secret values. */
  push(request: VercelPushRequest): Promise<ProviderPushResult>;
}

interface VercelEnvRecord {
  readonly key: string;
  readonly target?: VercelEnvironment | readonly VercelEnvironment[];
}

/**
 * Creates a Vercel deploy adapter.
 *
 * The adapter only returns key names in structured results. Do not log or
 * serialize the `values` object passed to `push`, because it contains secrets.
 *
 * @param options - Project, team, token, and fetch settings.
 * @returns Vercel deploy adapter.
 *
 * @example Check required production keys.
 * ```ts
 * import { listDeployEnvVars } from "@howells/envy";
 * import { vercel } from "@howells/envy/adapters/vercel";
 *
 * const adapter = vercel({ project: "my-app" });
 * const keys = listDeployEnvVars(envSchema, {
 *   environment: "production",
 * }).map((entry) => entry.key);
 *
 * const result = await adapter.check({
 *   environment: "production",
 *   keys,
 * });
 * ```
 */
export function vercel(options: VercelAdapterOptions): VercelDeployAdapter {
  const fetcher = options.fetch ?? fetch;

  return {
    name: "vercel",
    async check(request) {
      const existing = await listVercelEnv(
        fetcher,
        options,
        request.environment,
      );
      const present = request.keys.filter((key) => existing.has(key));
      const missing = request.keys.filter((key) => !existing.has(key));

      return {
        missing,
        present,
      };
    },
    async push(request) {
      const existing = await listVercelEnv(
        fetcher,
        options,
        request.environment,
      );
      const created: string[] = [];
      const skipped: string[] = [];

      for (const [key, value] of Object.entries(request.values)) {
        if (existing.has(key)) {
          if (request.overwrite) {
            throw new Error(
              "Vercel overwrite is intentionally blocked. Delete or rotate the variable manually, then push again.",
            );
          }

          skipped.push(key);
          continue;
        }

        if (!request.dryRun) {
          await createVercelEnv(fetcher, options, {
            environment: request.environment,
            key,
            value,
          });
        }

        created.push(key);
      }

      return {
        created,
        dryRun: request.dryRun ?? false,
        skipped,
      };
    },
  };
}

async function listVercelEnv(
  fetcher: typeof fetch,
  options: VercelAdapterOptions,
  environment: VercelEnvironment,
): Promise<Set<string>> {
  const response = await fetcher(
    vercelUrl(
      options,
      `/v9/projects/${encodeURIComponent(options.project)}/env`,
      {
        target: environment,
      },
    ),
    {
      headers: vercelHeaders(options),
    },
  );

  await assertOk(response, "list Vercel env");
  const body = (await response.json()) as { envs?: readonly VercelEnvRecord[] };

  return new Set(
    (body.envs ?? [])
      .filter((env) => envTargetsEnvironment(env, environment))
      .map((env) => env.key),
  );
}

async function createVercelEnv(
  fetcher: typeof fetch,
  options: VercelAdapterOptions,
  input: {
    readonly environment: VercelEnvironment;
    readonly key: string;
    readonly value: string;
  },
): Promise<void> {
  const response = await fetcher(
    vercelUrl(
      options,
      `/v10/projects/${encodeURIComponent(options.project)}/env`,
    ),
    {
      body: JSON.stringify({
        key: input.key,
        target: [input.environment],
        type: "encrypted",
        value: input.value,
      }),
      headers: {
        ...vercelHeaders(options),
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  await assertOk(response, "create Vercel env");
}

function envTargetsEnvironment(
  env: VercelEnvRecord,
  environment: VercelEnvironment,
): boolean {
  if (!env.target) {
    return true;
  }

  return Array.isArray(env.target)
    ? env.target.includes(environment)
    : env.target === environment;
}

function vercelHeaders(options: VercelAdapterOptions): Record<string, string> {
  const token = options.token ?? process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error("Missing Vercel token. Pass token or set VERCEL_TOKEN.");
  }

  return {
    authorization: `Bearer ${token}`,
  };
}

function vercelUrl(
  options: VercelAdapterOptions,
  path: string,
  query: Record<string, string> = {},
): string {
  const url = new URL(path, "https://api.vercel.com");

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  if (options.teamId) {
    url.searchParams.set("teamId", options.teamId);
  }

  return url.toString();
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (response.ok) {
    return;
  }

  throw new Error(
    `Failed to ${action}: ${response.status} ${response.statusText}`,
  );
}
