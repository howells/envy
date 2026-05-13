/**
 * Dotenv loading helpers for Envy.
 *
 * The core parser stays filesystem-free. This subpath is the explicit opt-in
 * boundary for projects that want conventional `.env` file loading before
 * calling an Envy schema parser.
 *
 * @module
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

/**
 * Options for loading one or more dotenv files.
 */
export interface LoadDotenvOptions {
  /**
   * Directory used to resolve relative dotenv paths.
   *
   * Defaults to `process.cwd()`.
   */
  readonly cwd?: string;
  /**
   * Allows later files to replace values that already exist in the target env.
   *
   * Defaults to false so CI-injected values win over local files.
   */
  readonly override?: boolean;
  /**
   * Target object to write into.
   *
   * Defaults to `process.env`; pass a plain object in tests.
   */
  readonly processEnv?: Record<string, string | undefined>;
  /**
   * Ignores missing files instead of throwing.
   *
   * Defaults to false because deployment preflights should fail loudly when a
   * requested source does not exist.
   */
  readonly skipMissing?: boolean;
}

/**
 * Result returned by {@link loadDotenv}.
 */
export interface LoadDotenvResult {
  /** Files that were found and parsed, in load order. */
  readonly loaded: readonly string[];
  /** Keys written to the target environment object. */
  readonly written: readonly string[];
}

/**
 * Parses a dotenv file into a plain object without mutating global state.
 *
 * @param path - File path to parse.
 * @param options - Path resolution and missing-file behavior.
 * @returns Parsed dotenv key/value pairs.
 *
 * @example
 * ```ts
 * import { parseDotenvFile } from "@howells/envy/dotenv";
 *
 * const values = parseDotenvFile(".env.production", { cwd: process.cwd() });
 * const env = envSchema.parseServer(values);
 * ```
 */
export function parseDotenvFile(
  path: string,
  options: Pick<LoadDotenvOptions, "cwd" | "skipMissing"> = {},
): Record<string, string> {
  const resolvedPath = resolve(options.cwd ?? process.cwd(), path);

  if (!existsSync(resolvedPath)) {
    if (options.skipMissing) {
      return {};
    }

    throw new Error(`Dotenv file not found: ${resolvedPath}`);
  }

  return parse(readFileSync(resolvedPath));
}

/**
 * Loads dotenv files into a target environment object.
 *
 * Files are read in order. Existing target values are preserved unless
 * `override` is true. Values are assigned exactly as parsed; the helper never
 * appends newlines or shells out through `echo`.
 *
 * @param paths - Dotenv files to load in order.
 * @param options - Loading behavior and target environment object.
 * @returns Files loaded and keys written.
 *
 * @example Load files into an isolated object before parsing.
 * ```ts
 * import { loadDotenv } from "@howells/envy/dotenv";
 *
 * const processEnv: Record<string, string | undefined> = {};
 * loadDotenv([".env", ".env.local"], { processEnv });
 * const env = envSchema.parseServer(processEnv);
 * ```
 */
export function loadDotenv(
  paths: readonly string[],
  options: LoadDotenvOptions = {},
): LoadDotenvResult {
  const target = options.processEnv ?? process.env;
  const loaded: string[] = [];
  const written = new Set<string>();

  for (const path of paths) {
    const resolvedPath = resolve(options.cwd ?? process.cwd(), path);
    const parsed = parseDotenvFile(resolvedPath, {
      skipMissing: options.skipMissing,
    });

    if (Object.keys(parsed).length === 0 && !existsSync(resolvedPath)) {
      continue;
    }

    loaded.push(resolvedPath);

    for (const [key, value] of Object.entries(parsed)) {
      if (!options.override && target[key] !== undefined) {
        continue;
      }

      target[key] = value;
      written.add(key);
    }
  }

  return {
    loaded,
    written: [...written].sort(),
  };
}
