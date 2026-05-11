/**
 * Railway deploy adapter scaffold for Envy.
 *
 * Railway support is part of Envy's core deployment story because a failed
 * deploy preflight should be caught before any provider receives an incomplete
 * set of variables. This module defines the public contract the implementation
 * will fill in.
 *
 * @module
 */

/**
 * Configuration for checking or pushing variables to a Railway service.
 */
export interface RailwayAdapterOptions {
  /** Target Railway environment name to inspect or update. */
  environment: string;
  /** Railway project name or id. */
  project: string;
  /** Railway service name or id. */
  service: string;
  /**
   * Explicit API token.
   *
   * If omitted, auth resolution should fall back to environment variables and
   * then local Railway CLI authentication.
   */
  token?: string;
}

/**
 * Minimal deploy adapter contract consumed by Envy deploy checks.
 *
 * Provider adapters should return structured results rather than formatted
 * strings so CLI, CI, and editor integrations can render their own output.
 */
export interface DeployAdapter {
  /** Human-readable provider name. */
  readonly name: string;
  /**
   * Reads remote env state and reports missing schema-declared variables.
   *
   * Implementations must not mutate provider state from this method.
   */
  check(): Promise<unknown>;
  /**
   * Safely writes schema-declared variables to the remote provider.
   *
   * Implementations must exclude undeclared variables and avoid echo-style
   * writes that can introduce trailing newlines into secrets.
   */
  push(): Promise<unknown>;
}

/**
 * Creates a Railway deploy adapter.
 *
 * The implementation should check service and shared variables, use Railway's
 * API before CLI fallback, and avoid printing secret values.
 *
 * @param options - Railway project, service, environment, and auth settings.
 * @returns A deploy adapter for Railway preflight and push commands.
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
