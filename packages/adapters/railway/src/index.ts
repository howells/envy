/**
 * Configuration for checking or pushing variables to a Railway service.
 */
export interface RailwayAdapterOptions {
  /** Target Railway environment name. */
  environment: string;
  /** Railway project name or id. */
  project: string;
  /** Railway service name or id. */
  service: string;
  /** Explicit API token. If omitted, auth resolution should fall back to env and CLI auth. */
  token?: string;
}

/**
 * Minimal deploy adapter contract consumed by Envy deploy checks.
 */
export interface DeployAdapter {
  /** Human-readable provider name. */
  readonly name: string;
  /** Reads remote env state and reports missing schema-declared variables. */
  check(): Promise<unknown>;
  /** Safely writes schema-declared variables to the remote provider. */
  push(): Promise<unknown>;
}

/**
 * Creates a Railway deploy adapter.
 *
 * The implementation should check service and shared variables, use Railway's
 * API before CLI fallback, and avoid printing secret values.
 */
export function railway(options: RailwayAdapterOptions): DeployAdapter {
  return {
    name: "railway",
    async check() {
      throw new Error(
        `@envy/adapter-railway check is not implemented for ${options.project}.`,
      );
    },
    async push() {
      throw new Error(
        `@envy/adapter-railway push is not implemented for ${options.project}.`,
      );
    },
  };
}
