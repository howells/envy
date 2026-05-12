import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

export interface LoadDotenvOptions {
  readonly cwd?: string;
  readonly override?: boolean;
  readonly processEnv?: Record<string, string | undefined>;
  readonly skipMissing?: boolean;
}

export interface LoadDotenvResult {
  readonly loaded: readonly string[];
  readonly written: readonly string[];
}

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
