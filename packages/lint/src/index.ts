export type LintTarget = "biome" | "eslint" | "oxlint";

export interface LintIntegrationOptions {
  readonly allowedVariables?: readonly string[];
  readonly envFiles?: readonly string[];
}

export function createOxlintConfig(
  options: LintIntegrationOptions = {},
): Record<string, unknown> {
  return {
    overrides: createEnvFileOverrides(options.envFiles),
    plugins: ["node"],
    rules: {
      "node/no-process-env": [
        "error",
        {
          allowedVariables: options.allowedVariables ?? ["NODE_ENV", "CI"],
        },
      ],
    },
  };
}

export function createEslintConfig(
  options: LintIntegrationOptions = {},
): readonly Record<string, unknown>[] {
  return [
    {
      ignores: [...(options.envFiles ?? [])],
      rules: {
        "no-restricted-properties": [
          "error",
          {
            message:
              "Import the typed env module instead of reading process.env directly.",
            object: "process",
            property: "env",
          },
        ],
      },
    },
  ];
}

export function createBiomeConfig(
  options: LintIntegrationOptions = {},
): Record<string, unknown> {
  return {
    files: {
      includes: (options.envFiles ?? []).map((file) => `!${file}`),
    },
  };
}

export function createLintIntegration(
  target: LintTarget,
  options: LintIntegrationOptions = {},
): unknown {
  if (target === "oxlint") return createOxlintConfig(options);
  if (target === "eslint") return createEslintConfig(options);
  return createBiomeConfig(options);
}

function createEnvFileOverrides(
  envFiles: readonly string[] | undefined,
): readonly Record<string, unknown>[] {
  if (!envFiles || envFiles.length === 0) return [];

  return [
    {
      files: envFiles,
      rules: {
        "node/no-process-env": "off",
      },
    },
  ];
}
