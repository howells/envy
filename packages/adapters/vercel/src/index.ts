/**
 * Vercel environment targets supported by the Vercel env API.
 */
export type VercelEnvironment = "development" | "preview" | "production";

/**
 * Configuration for Vercel env checks and pushes.
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
 * Request for checking that schema-declared keys exist in Vercel.
 */
export interface VercelCheckRequest {
  /** Target Vercel environment. */
  readonly environment: VercelEnvironment;
  /** Schema-declared keys that must exist remotely. */
  readonly keys: readonly string[];
}

/**
 * Request for pushing schema-declared values to Vercel.
 */
export interface VercelPushRequest {
  /** Reports planned writes without changing remote state. */
  readonly dryRun?: boolean;
  /** Target Vercel environment. */
  readonly environment: VercelEnvironment;
  /** Allows replacing existing values. Currently blocked for Vercel safety. */
  readonly overwrite?: boolean;
  /** Schema-declared values to write. */
  readonly values: Readonly<Record<string, string>>;
}

/**
 * Structured result returned by provider env checks.
 */
export interface ProviderCheckResult {
  /** Variables present in the provider. */
  readonly present: readonly string[];
  /** Variables missing from the provider. */
  readonly missing: readonly string[];
}

/**
 * Structured result returned by Vercel env pushes.
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
 * Vercel deploy adapter returned by {@link vercel}.
 */
export interface VercelDeployAdapter {
  /** Provider name for structured output. */
  readonly name: "vercel";
  /**
   * Checks that schema-declared keys exist remotely.
   *
   * @param request - Target environment and required keys.
   * @returns Present and missing key names.
   */
  check(request: VercelCheckRequest): Promise<ProviderCheckResult>;
  /**
   * Pushes schema-declared values without printing secret values.
   *
   * @param request - Target environment and values to write.
   * @returns Created, skipped, and dry-run status.
   */
  push(request: VercelPushRequest): Promise<ProviderPushResult>;
}

interface VercelEnvRecord {
  readonly key: string;
}

/**
 * Creates a Vercel deploy adapter.
 *
 * @param options - Project, team, token, and fetch settings.
 * @returns Vercel deploy adapter.
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

      return {
        missing: request.keys.filter((key) => !existing.has(key)),
        present: request.keys.filter((key) => existing.has(key)),
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
  return new Set((body.envs ?? []).map((env) => env.key));
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

function vercelHeaders(options: VercelAdapterOptions): Record<string, string> {
  const token = options.token ?? process.env.VERCEL_TOKEN;
  if (!token)
    throw new Error("Missing Vercel token. Pass token or set VERCEL_TOKEN.");
  return { authorization: `Bearer ${token}` };
}

function vercelUrl(
  options: VercelAdapterOptions,
  path: string,
  query: Record<string, string> = {},
): string {
  const url = new URL(path, "https://api.vercel.com");
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  if (options.teamId) url.searchParams.set("teamId", options.teamId);
  return url.toString();
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    throw new Error(
      `Failed to ${action}: ${response.status} ${response.statusText}`,
    );
  }
}
