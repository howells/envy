import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";
import type { Flags } from "./flags.js";
import { CliInputError } from "./problem.js";

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
    Object.assign(input, parse(fileContents));
  }
  return input;
}
