import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type EnvDefinition, type EnvSchema, listEnvVars } from "../index.js";
import type { Flags } from "./flags.js";
import { CliInputError, CliUsageError } from "./problem.js";

export const checkModes = ["server", "client", "all"] as const;
export type CheckMode = (typeof checkModes)[number];

type AnyEnvSchema = EnvSchema<EnvDefinition>;

/**
 * Imports the schema module named by `--schema` and returns its Envy schema.
 *
 * @throws {@link CliInputError} when the file cannot be read.
 * @throws {@link CliUsageError} when the module does not export a schema.
 */
export async function importEnvSchema(
  flags: Flags,
  cwd: string,
): Promise<AnyEnvSchema> {
  const schemaFile = resolve(cwd, flags.required("schema"));
  try {
    await access(schemaFile);
  } catch {
    throw new CliInputError(`Schema file could not be read: ${schemaFile}`, [
      "Check the --schema path and make sure the file exists.",
    ]);
  }

  const exportName = flags.optional("export");
  const moduleExports: Record<string, unknown> = await import(
    `${pathToFileURL(schemaFile).href}?envy=${Date.now()}`
  );
  const schema = exportName
    ? moduleExports[exportName]
    : (moduleExports.default ??
      moduleExports.envSchema ??
      moduleExports.schema);

  if (!isEnvSchema(schema)) {
    const exportHint = exportName
      ? `export named ${exportName}`
      : "default export, envSchema export, or schema export";
    throw new CliUsageError(
      `Schema module must provide an Envy schema as ${exportHint}.`,
      ["Export the result of defineEnv(...) from the schema module."],
    );
  }

  return schema;
}

export function parseWithMode(
  schema: AnyEnvSchema,
  input: Record<string, unknown>,
  mode: CheckMode,
): object {
  if (mode === "all") return schema.parse(input);
  if (mode === "client") return schema.parseClient(input);
  return schema.parseServer(input);
}

export function listSchemaKeys(
  schema: AnyEnvSchema,
  mode: CheckMode,
): readonly string[] {
  return listEnvVars(schema, mode === "client" ? { groups: ["public"] } : {})
    .map((entry) => entry.key)
    .sort();
}

function isEnvSchema(value: unknown): value is AnyEnvSchema {
  return (
    typeof value === "object" &&
    value !== null &&
    "parse" in value &&
    "parseClient" in value &&
    "parseServer" in value
  );
}
