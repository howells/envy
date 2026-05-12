import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EnvDefinition, EnvSchema } from "@howells/envy";

export interface NextEnvCodegenOptions {
  readonly clientFile?: string;
  readonly schemaImportPath?: string;
  readonly serverFile?: string;
}

export interface GeneratedNextEnvFiles {
  readonly client: string;
  readonly server: string;
}

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
