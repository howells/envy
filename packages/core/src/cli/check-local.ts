import type { CliIO, CommandReport } from "./commands.js";
import { readDotenvInput } from "./dotenv-input.js";
import type { Flags } from "./flags.js";
import { checkModes, importEnvSchema, parseWithMode } from "./schema.js";

/** Validates process env, or the `--from` dotenv files, against the schema. */
export async function checkLocal(
  flags: Flags,
  io: CliIO,
): Promise<CommandReport> {
  const mode = flags.oneOf("mode", checkModes);
  const from = flags.list("from");
  const schema = await importEnvSchema(flags, io.cwd);
  const input =
    from.length === 0 ? { ...io.env } : await readDotenvInput(flags, io.cwd);
  const keys = Object.keys(parseWithMode(schema, input, mode)).sort();
  const sources = from.length > 0 ? from : ["process.env"];

  return {
    data: { keyCount: keys.length, keys, mode, sources },
    text: `Envy local check passed: ${keys.length} variable(s) validated from ${sources.join(", ")}.`,
  };
}
