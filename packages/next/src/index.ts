import type { EnvDefinition, EnvSchema } from "@envy/core";

/**
 * Options for synchronizing generated Next.js env files.
 */
export interface SyncNextOptions {
  /**
   * Destination for generated client-side public env mapping.
   */
  clientFile?: string;
  /**
   * Destination for generated server-side env parsing.
   */
  serverFile?: string;
}

/**
 * Generates or updates explicit Next.js env files from an Envy schema.
 *
 * Client-side output must contain literal `process.env.NEXT_PUBLIC_*` property
 * reads so Next.js can inline values during bundling. This is why Envy uses
 * code generation here instead of runtime reflection.
 */
export function syncNextEnv<TDefinition extends EnvDefinition>(
  _schema: EnvSchema<TDefinition>,
  _options: SyncNextOptions = {},
): void {
  throw new Error("@envy/next syncNextEnv is not implemented yet.");
}
