import type { EnvDefinition, EnvSchema } from "@howells/envy";

/**
 * Next.js integration helpers for Envy schemas.
 *
 * Next requires public variables to be referenced as literal property reads so
 * the bundler can inline them. This package owns that framework-specific code
 * generation boundary while the core parser remains framework-agnostic.
 *
 * @module
 */

/**
 * Options for synchronizing generated Next.js env files.
 */
export interface SyncNextOptions {
  /**
   * Destination for generated client-side public env mapping.
   *
   * The generated file should contain explicit `process.env.NEXT_PUBLIC_*`
   * accesses, not dynamic iteration, so Next can statically inline values.
   */
  clientFile?: string;
  /**
   * Destination for generated server-side env parsing.
   *
   * This file can safely read from `process.env` because it becomes the single
   * typed boundary that application code imports instead.
   */
  serverFile?: string;
}

/**
 * Generates or updates explicit Next.js env files from an Envy schema.
 *
 * Client-side output must contain literal `process.env.NEXT_PUBLIC_*` property
 * reads so Next.js can inline values during bundling. This is why Envy uses
 * code generation here instead of runtime reflection.
 *
 * @param _schema - Envy schema that defines server and public keys.
 * @param _options - Destination files for generated Next integration code.
 * @throws Error until the Next integration implementation is added.
 */
export function syncNextEnv<TDefinition extends EnvDefinition>(
  _schema: EnvSchema<TDefinition>,
  _options: SyncNextOptions = {},
): void {
  throw new Error("@envy/next syncNextEnv is not implemented yet.");
}
