import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Flags } from "./flags.js";
import { CliInputError } from "./problem.js";

/**
 * Parses dotenv file contents into a plain object.
 *
 * This parser is deliberately conservative: it supports the syntax teams use in
 * normal `.env` files, never appends newlines to values, and ignores blank lines
 * or comments. It does not mutate `process.env`.
 *
 * @param contents - Raw dotenv file contents.
 * @returns Parsed key/value pairs.
 */
export function parseDotenv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalizedLine = line.startsWith("export ")
      ? line.slice(7).trimStart()
      : line;
    const equalsIndex = normalizedLine.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = normalizedLine.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    values[key] = parseDotenvValue(
      normalizedLine.slice(equalsIndex + 1).trim(),
    );
  }

  return values;
}

/**
 * Reads and merges every `--from` file in order; later files win.
 *
 * @throws {@link CliInputError} when a file cannot be read.
 */
export async function readDotenvInput(
  flags: Flags,
  cwd: string,
): Promise<Record<string, string>> {
  const input: Record<string, string> = {};
  for (const fromPath of flags.list("from")) {
    const resolvedPath = resolve(cwd, fromPath);
    let fileContents: string;
    try {
      fileContents = await readFile(resolvedPath, "utf8");
    } catch {
      throw new CliInputError(`Env file could not be read: ${resolvedPath}`, [
        "Check the --from path and make sure the file exists.",
      ]);
    }
    Object.assign(input, parseDotenv(fileContents));
  }
  return input;
}

function parseDotenvValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replaceAll("\\n", "\n")
      .replaceAll("\\r", "\r")
      .replaceAll('\\"', '"')
      .replaceAll("\\\\", "\\");
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  const commentIndex = value.indexOf(" #");
  return (commentIndex === -1 ? value : value.slice(0, commentIndex)).trimEnd();
}
