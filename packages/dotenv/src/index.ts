/**
 * Explicit dotenv loading helpers for Envy projects.
 *
 * `@howells/envy` itself never reads files or mutates `process.env`. This
 * package is the opt-in boundary for projects and CLIs that want conventional
 * dotenv behavior before handing a plain object to an Envy schema.
 *
 * @module
 */

/**
 * Options for loading one or more dotenv files into `process.env`.
 *
 * These options mirror the decisions Envy cares about: whether existing
 * process values are treated as authoritative, and whether parser output should
 * be quiet in scripts and CI.
 */
export interface LoadDotenvOptions {
  /**
   * When true, values from later files may replace existing `process.env`
   * values. The default should be false once implemented.
   *
   * Keeping the default false preserves the common CI contract where externally
   * injected variables win over local files.
   */
  override?: boolean;
  /**
   * Suppresses dotenv parser output.
   *
   * This should be enabled by default for machine-oriented commands that format
   * their own diagnostics.
   */
  quiet?: boolean;
}

/**
 * Loads dotenv files as an explicit opt-in step before parsing.
 *
 * Core parsing intentionally accepts plain objects and does not read files.
 * This helper exists for applications and CLIs that want conventional `.env`
 * loading without coupling `@howells/envy` to the filesystem.
 *
 * @param _paths - Dotenv file paths to load in order.
 * @param _options - Loading behavior such as override precedence.
 * @throws Error until the dotenv package implementation is added.
 */
export function loadDotenv(
  _paths: readonly string[],
  _options: LoadDotenvOptions = {},
): void {
  throw new Error("@envy/dotenv loadDotenv is not implemented yet.");
}
