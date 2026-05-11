/**
 * Configuration consumed by the Envy CLI.
 *
 * Runtime libraries do not need this file. It exists so CLI commands can find
 * the env schema and project defaults without repeating long flags.
 */
export interface EnvyConfig {
  /**
   * Default deploy target used by commands when the target is omitted.
   */
  defaultTarget?: "vercel" | "railway";
  /**
   * Directory that contains env files such as `.env.local` or `.env.production`.
   */
  envDir?: string;
  /**
   * Path to the TypeScript file that exports the Envy schema.
   */
  schema: string;
}

/**
 * Defines an `envy.config.ts` file with type inference and excess-property
 * checking from TypeScript.
 */
export function defineConfig<const TConfig extends EnvyConfig>(
  config: TConfig,
): TConfig {
  return config;
}
