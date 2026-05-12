/**
 * Railway deployment environment adapter for Envy.
 *
 * Railway support uses the GraphQL API directly so values can be checked and
 * pushed without shell quoting, pipes, or implicit newline handling.
 *
 * @module
 */

/**
 * Railway adapter configuration.
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
 * Request for checking remote env state.
 */
export interface RailwayCheckRequest {
  /** Schema-declared keys that must exist remotely. */
  readonly keys: readonly string[];
}

/**
 * Request for pushing env values to Railway.
 */
export interface RailwayPushRequest {
  /** Performs validation and reports actions without writing remote state. */
  readonly dryRun?: boolean;
  /** Allows replacing existing values. Defaults to false. */
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
  /** Variables created or updated by the push. */
  readonly written: readonly string[];
  /** Variables skipped because they already existed. */
  readonly skipped: readonly string[];
  /** Whether remote state was left unchanged. */
  readonly dryRun: boolean;
}

/**
 * Deploy adapter returned by {@link railway}.
 */
export interface RailwayDeployAdapter {
  /** Provider name for structured output. */
  readonly name: "railway";
  /** Checks that schema-declared variables exist in Railway. */
  check(request: RailwayCheckRequest): Promise<ProviderCheckResult>;
  /** Pushes schema-declared values to Railway without printing secret values. */
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
      const present = request.keys.filter((key) => existing.has(key));
      const missing = request.keys.filter((key) => !existing.has(key));

      return {
        missing,
        present,
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

        if (!request.dryRun) {
          await upsertRailwayEnv(fetcher, options, { key, value });
        }

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
  const body = await railwayGraphql<{
    variables: Record<string, string>;
  }>(
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
  input: {
    readonly key: string;
    readonly value: string;
  },
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

  if (!body.data) {
    throw new Error("Railway API response did not include data.");
  }

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
  if (!token) {
    throw new Error("Missing Railway token. Pass token or set RAILWAY_TOKEN.");
  }

  return token;
}
