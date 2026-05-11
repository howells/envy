/**
 * Options for loading one or more dotenv files into `process.env`.
 */
export interface LoadDotenvOptions {
  /**
   * When true, values from later files may replace existing `process.env`
   * values. The default should be false once implemented.
   */
  override?: boolean;
  /**
   * Suppresses dotenv parser output.
   */
  quiet?: boolean;
}

/**
 * Loads dotenv files as an explicit opt-in step before parsing.
 *
 * Core parsing intentionally accepts plain objects and does not read files.
 * This helper exists for applications and CLIs that want conventional `.env`
 * loading without coupling `@howells/envy` to the filesystem.
 */
export function loadDotenv(
  _paths: readonly string[],
  _options: LoadDotenvOptions = {},
): void {
  throw new Error("@envy/dotenv loadDotenv is not implemented yet.");
}
