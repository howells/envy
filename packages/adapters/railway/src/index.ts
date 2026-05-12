/**
 * Configuration for Railway env checks and pushes.
 */
export interface RailwayAdapterOptions {
  /** Railway environment id. */
  readonly environmentId: string;
  /** Fetch implementation used for API calls. Defaults to global `fetch`. */
  readonly fetch?: typeof fetch;
  /** Railway project id. */
  readonly projectId: string;
  /** Railway service id. */
  readonly serviceId: string;
  /** Railway API token. Defaults to `RAILWAY_TOKEN`. */
  readonly token?: string;
}

/**
 * Request for checking that schema-declared keys exist in Railway.
 */
export interface RailwayCheckRequest {
  /** Schema-declared keys that must exist remotely. */
  readonly keys: readonly string[];
}

/**
 * Request for pushing schema-declared values to Railway.
 */
export interface RailwayPushRequest {
  /** Reports planned writes without changing remote state. */
  readonly dryRun?: boolean;
  /** Allows replacing existing values. Defaults to false. */
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
 * Structured result returned by Railway env pushes.
 */
export interface ProviderPushResult {
  /** Variables created or updated by the push. */
  readonly written: readonly string[];
  /** Variables skipped because they already existed. */
  readonly skipped: readonly string[];
  /** Whether remote state was left unchanged. */
  readonly dryRun: boolean;
}

/**
 * Railway deploy adapter returned by {@link railway}.
 */
export interface RailwayDeployAdapter {
  /** Provider name for structured output. */
  readonly name: "railway";
  /**
   * Checks that schema-declared keys exist remotely.
   *
   * @param request - Required key names.
   * @returns Present and missing key names.
   */
  check(request: RailwayCheckRequest): Promise<ProviderCheckResult>;
  /**
   * Pushes schema-declared values without printing secret values.
   *
   * @param request - Values to write and push behavior.
   * @returns Written, skipped, and dry-run status.
   */
  push(request: RailwayPushRequest): Promise<ProviderPushResult>;
}

/**
 * Creates a Railway deploy adapter.
 *
 * @param options - Project, service, environment, token, and fetch settings.
 * @returns Railway deploy adapter.
 */
export function railway(options: RailwayAdapterOptions): RailwayDeployAdapter {
  const fetcher = options.fetch ?? fetch;

  return {
    name: "railway",
    async check(request) {
      const existing = await listRailwayEnv(fetcher, options);

      return {
        missing: request.keys.filter((key) => !existing.has(key)),
        present: request.keys.filter((key) => existing.has(key)),
      };
    },
    async push(request) {
      const existing = await listRailwayEnv(fetcher, options);
      const written: string[] = [];
      const skipped: string[] = [];

      for (const [key, value] of Object.entries(request.values)) {
        if (existing.has(key) && !request.overwrite) {
          skipped.push(key);
          continue;
        }

        if (!request.dryRun)
          await upsertRailwayEnv(fetcher, options, { key, value });
        written.push(key);
      }

      return {
        dryRun: request.dryRun ?? false,
        skipped,
        written,
      };
    },
  };
}

async function listRailwayEnv(
  fetcher: typeof fetch,
  options: RailwayAdapterOptions,
): Promise<Set<string>> {
  const body = await railwayGraphql<{ variables: Record<string, string> }>(
    fetcher,
    options,
    `query EnvyVariables($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    railwayVariables(options),
  );

  return new Set(Object.keys(body.variables ?? {}));
}

async function upsertRailwayEnv(
  fetcher: typeof fetch,
  options: RailwayAdapterOptions,
  input: { readonly key: string; readonly value: string },
): Promise<void> {
  await railwayGraphql(
    fetcher,
    options,
    `mutation EnvyVariableUpsert($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }`,
    {
      input: {
        ...railwayVariables(options),
        name: input.key,
        value: input.value,
      },
    },
  );
}

async function railwayGraphql<TData>(
  fetcher: typeof fetch,
  options: RailwayAdapterOptions,
  query: string,
  variables: Record<string, unknown>,
): Promise<TData> {
  const response = await fetcher("https://backboard.railway.app/graphql/v2", {
    body: JSON.stringify({ query, variables }),
    headers: {
      authorization: `Bearer ${railwayToken(options)}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to call Railway API: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as {
    data?: TData;
    errors?: readonly { readonly message?: string }[];
  };

  if (body.errors && body.errors.length > 0) {
    throw new Error(
      `Railway API error: ${body.errors.map((error) => error.message ?? "Unknown error").join("; ")}`,
    );
  }

  if (!body.data) throw new Error("Railway API response did not include data.");
  return body.data;
}

function railwayVariables(
  options: RailwayAdapterOptions,
): Record<string, string> {
  return {
    environmentId: options.environmentId,
    projectId: options.projectId,
    serviceId: options.serviceId,
  };
}

function railwayToken(options: RailwayAdapterOptions): string {
  const token = options.token ?? process.env.RAILWAY_TOKEN;
  if (!token)
    throw new Error("Missing Railway token. Pass token or set RAILWAY_TOKEN.");
  return token;
}
