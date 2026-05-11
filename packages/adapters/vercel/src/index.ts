/**
 * Vercel deploy adapter scaffold for Envy.
 *
 * The adapter contract is intentionally strict: checks must be read-only, pushes
 * must only write schema-declared variables, and implementations must never log
 * secret values. That discipline is what keeps deployment preflight useful.
 *
 * @module
 */

/**
 * Vercel environment names supported by the Vercel env API.
 *
 * These names align with Vercel's env scopes and with Envy's deploy metadata.
 */
export type VercelEnvironment = "development" | "preview" | "production";

/**
 * Configuration for checking or pushing variables to a Vercel project.
 */
export interface VercelAdapterOptions {
  /** Target Vercel environment to inspect or update. */
  environment: VercelEnvironment;
  /** Vercel project name or id. */
  project: string;
  /** Optional Vercel team slug or id for team-owned projects. */
  team?: string;
  /**
   * Explicit API token.
   *
   * If omitted, auth resolution should fall back to environment variables and
   * then local Vercel CLI authentication.
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
 * Creates a Vercel deploy adapter.
 *
 * The implementation should use the Vercel API first and CLI fallback second,
 * never print secret values, and never mutate remote variables during `check`.
 *
 * @param options - Vercel project, environment, team, and auth settings.
 * @returns A deploy adapter for Vercel preflight and push commands.
 */
export function vercel(options: VercelAdapterOptions): DeployAdapter {
  return {
    name: "vercel",
    async check() {
      throw new Error(
        `@envy/adapter-vercel check is not implemented for ${options.project}.`,
      );
    },
    async push() {
      throw new Error(
        `@envy/adapter-vercel push is not implemented for ${options.project}.`,
      );
    },
  };
}
