/**
 * Typed configuration helpers for `envy.config.ts`.
 *
 * The config package is deliberately tiny. It gives CLI users a strongly typed
 * place to declare where their schema lives and which deploy target should be
 * used by default, while keeping the runtime parser free of filesystem and
 * project-layout assumptions.
 *
 * @example
 * ```ts
 * import { defineConfig } from "@envy/config";
 *
 * export default defineConfig({
 *   defaultTarget: "vercel",
 *   envDir: ".",
 *   schema: "src/env/schema.ts",
 * });
 * ```
 *
 * @module
 */

/**
 * Configuration consumed by the Envy CLI.
 *
 * Runtime libraries do not need this file. It exists so CLI commands can find
 * the env schema and project defaults without repeating long flags or requiring
 * every command invocation to rediscover project structure.
 */
export interface EnvyConfig {
  /**
   * Default deploy target used by commands when the target is omitted.
   *
   * This is only a convenience default. Commands may still accept explicit
   * provider flags when a project uses more than one deployment surface.
   */
  defaultTarget?: "vercel" | "railway";
  /**
   * Directory that contains env files such as `.env.local` or `.env.production`.
   *
   * Relative paths should be resolved from the config file directory by the CLI
   * so monorepos can place a config beside the application it controls.
   */
  envDir?: string;
  /**
   * Path to the TypeScript file that exports the Envy schema.
   *
   * The CLI uses this path to import the schema for local checks, deploy
   * preflights, and generated framework integrations.
   */
  schema: string;
}

/**
 * Defines an `envy.config.ts` file with type inference and excess-property
 * checking from TypeScript.
 *
 * The function is intentionally an identity function at runtime. Its value is
 * in preserving literal types for callers and surfacing typos while editing.
 *
 * @param config - Project-level Envy configuration.
 * @returns The same config object, with literal types preserved.
 */
export function defineConfig<const TConfig extends EnvyConfig>(
  config: TConfig,
): TConfig {
  return config;
}
