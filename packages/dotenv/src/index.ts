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
   * Allows file values to replace values that already exist in the target env.
   *
   * Defaults to false so CI and shell-injected values win over local files.
   */
  readonly override?: boolean;
  /**
   * Target object to write parsed values into.
   *
   * Defaults to `process.env`; pass a plain object in tests or preflight code
   * that must not mutate global state.
   */
  readonly processEnv?: Record<string, string | undefined>;
  /**
   * Ignores missing files instead of throwing.
   *
   * Defaults to false because deployment checks should fail loudly when an
   * explicitly requested env file is absent.
   */
  readonly skipMissing?: boolean;
}

/**
 * Result returned by {@link loadDotenv}.
 */
export interface LoadDotenvResult {
  /** Absolute file paths that were found and parsed, in load order. */
  readonly loaded: readonly string[];
  /** Environment keys written to the target object. */
  readonly written: readonly string[];
}

/**
 * Parses one dotenv file into a plain object without mutating `process.env`.
 *
 * @param path - Dotenv file path, resolved from `options.cwd` when relative.
 * @param options - Path resolution and missing-file behavior.
 * @returns Parsed dotenv key/value pairs.
 * @throws Error when the file is missing and `skipMissing` is not enabled.
 */
export function parseDotenvFile(
  path: string,
  options: Pick<LoadDotenvOptions, "cwd" | "skipMissing"> = {},
): Record<string, string> {
  const resolvedPath = resolve(options.cwd ?? process.cwd(), path);

  if (!existsSync(resolvedPath)) {
    if (options.skipMissing) return {};
    throw new Error(`Dotenv file not found: ${resolvedPath}`);
  }

  return parse(readFileSync(resolvedPath));
}

/**
 * Loads dotenv files into a target environment object.
 *
 * Files are parsed in order. Existing target values are preserved unless
 * `override` is true. Values are assigned exactly as parsed; the helper never
 * shells out, pipes through `echo`, or appends newlines to secrets.
 *
 * @param paths - Dotenv files to parse and merge.
 * @param options - Loading behavior and target environment object.
 * @returns Files loaded and keys written.
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
      if (!options.override && target[key] !== undefined) continue;
      target[key] = value;
      written.add(key);
    }
  }

  return {
    loaded,
    written: [...written].sort(),
  };
}
