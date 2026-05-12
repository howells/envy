import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EnvDefinition, EnvSchema } from "@howells/envy";

/**
 * Options for generated Next.js env boundary files.
 */
export interface NextEnvCodegenOptions {
  /**
   * Destination for the generated client env file.
   *
   * The file contains literal `process.env.NEXT_PUBLIC_*` reads so Next can
   * inline values into the client bundle.
   */
  readonly clientFile?: string;
  /**
   * Import path used by generated files to import `envSchema`.
   *
   * Defaults to `./schema`, which matches the recommended `src/env` layout.
   */
  readonly schemaImportPath?: string;
  /**
   * Destination for the generated server env file.
   *
   * The file centralizes server-side `process.env` access.
   */
  readonly serverFile?: string;
}

/**
 * Source strings produced by {@link generateNextEnvFiles}.
 */
export interface GeneratedNextEnvFiles {
  /** Source for the generated client env module. */
  readonly client: string;
  /** Source for the generated server env module. */
  readonly server: string;
}

/**
 * Generates Next.js env boundary source from an Envy schema.
 *
 * @param schema - Envy schema returned by `defineEnv`.
 * @param options - Import path used in generated modules.
 * @returns Client and server module source.
 */
export function generateNextEnvFiles<TDefinition extends EnvDefinition>(
  schema: EnvSchema<TDefinition>,
  options: Pick<NextEnvCodegenOptions, "schemaImportPath"> = {},
): GeneratedNextEnvFiles {
  const schemaImportPath = options.schemaImportPath ?? "./schema";
  const publicKeys = Object.keys(schema.definition.public ?? {});
  const clientMapping =
    publicKeys.length === 0
      ? ""
      : `${publicKeys.map((key) => `  ${key}: process.env.${key},`).join("\n")}\n`;

  return {
    client: `import { envSchema } from "${schemaImportPath}";\n\nexport const env = envSchema.parseClient({\n${clientMapping}});\n`,
    server: `import { envSchema } from "${schemaImportPath}";\n\nexport const env = envSchema.parseServer(process.env);\n`,
  };
}

/**
 * Writes generated Next.js env boundary files to disk.
 *
 * @param schema - Envy schema returned by `defineEnv`.
 * @param options - Destination files and schema import path.
 * @returns Generated source that was written.
 */
export function syncNextEnv<TDefinition extends EnvDefinition>(
  schema: EnvSchema<TDefinition>,
  options: NextEnvCodegenOptions = {},
): GeneratedNextEnvFiles {
  const clientFile = options.clientFile ?? "src/env/client.ts";
  const serverFile = options.serverFile ?? "src/env/server.ts";
  const generated = generateNextEnvFiles(schema, options);

  mkdirSync(dirname(clientFile), { recursive: true });
  mkdirSync(dirname(serverFile), { recursive: true });
  writeFileSync(clientFile, generated.client);
  writeFileSync(serverFile, generated.server);

  return generated;
}
