/**
 * Next.js code generation helpers for Envy schemas.
 *
 * Next only inlines public environment variables when it can see literal
 * `process.env.NEXT_PUBLIC_*` property reads. These helpers generate that
 * explicit boundary from the Envy schema.
 *
 * @module
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EnvDefinition, EnvSchema } from "./index.js";
import { listEnvVars } from "./index.js";

/**
 * Options for generated Next env files.
 */
export interface NextEnvCodegenOptions {
  /** Destination for client-safe public env mapping. */
  readonly clientFile?: string;
  /** Import path used by generated files to import `envSchema`. */
  readonly schemaImportPath?: string;
  /** Destination for server env parsing. */
  readonly serverFile?: string;
}

/**
 * Generated source returned by {@link generateNextEnvFiles}.
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
  const publicKeys = listEnvVars(schema, { groups: ["public"] }).map(
    (entry) => entry.key,
  );
  const clientMapping =
    publicKeys.length === 0
      ? ""
      : `${publicKeys
          .map((key) => `  ${key}: process.env.${key},`)
          .join("\n")}\n`;

  return {
    client: `import { envSchema } from "${schemaImportPath}";\n\nexport const env = envSchema.parseClient({\n${clientMapping}});\n`,
    server: `import { envSchema } from "${schemaImportPath}";\n\nexport const env = envSchema.parseServer(process.env);\n`,
  };
}

/**
 * Writes generated Next.js env files to disk.
 *
 * The generated client file contains literal public env property reads. The
 * generated server file centralizes the only intended `process.env` access for
 * application server code.
 *
 * @param schema - Envy schema returned by `defineEnv`.
 * @param options - Destination files and schema import path.
 * @returns The generated source that was written.
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
