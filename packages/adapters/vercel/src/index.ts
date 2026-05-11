/**
 * Vercel environment names supported by the Vercel env API.
 */
export type VercelEnvironment = "development" | "preview" | "production";

/**
 * Configuration for checking or pushing variables to a Vercel project.
 */
export interface VercelAdapterOptions {
  /** Target Vercel environment. */
  environment: VercelEnvironment;
  /** Vercel project name or id. */
  project: string;
  /** Optional Vercel team slug or id. */
  team?: string;
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
 * Creates a Vercel deploy adapter.
 *
 * The implementation should use the Vercel API first and CLI fallback second,
 * never print secret values, and never mutate remote variables during `check`.
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
