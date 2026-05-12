/**
 * Lint systems Envy can generate config fragments for.
 */
export type LintTarget = "biome" | "eslint" | "oxlint";

/**
 * Options shared by all Envy lint integrations.
 */
export interface LintIntegrationOptions {
  /**
   * Env variable names that may still be read directly from `process.env`.
   *
   * Typical examples are runtime-owned keys such as `NODE_ENV` and `CI`.
   */
  readonly allowedVariables?: readonly string[];
  /**
   * Files that define the typed env boundary and may read `process.env`.
   */
  readonly envFiles?: readonly string[];
}

/**
 * Creates an Oxlint config fragment using `node/no-process-env`.
 *
 * @param options - Allowed direct env reads and env boundary files.
 * @returns Oxlint config fragment.
 */
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

/**
 * Creates an ESLint flat-config fragment that bans direct `process.env` reads.
 *
 * @param options - Env boundary files to exempt.
 * @returns ESLint flat config array.
 */
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

/**
 * Creates a Biome companion config fragment for generated env files.
 *
 * Biome does not currently provide the same `process.env` rule semantics as
 * Oxlint or ESLint, so this helper covers the part Envy can own directly:
 * excluding env boundary files from generic diagnostics.
 *
 * @param options - Env boundary files to exclude.
 * @returns Biome config fragment.
 */
export function createBiomeConfig(
  options: LintIntegrationOptions = {},
): Record<string, unknown> {
  return {
    files: {
      includes: (options.envFiles ?? []).map((file) => `!${file}`),
    },
  };
}

/**
 * Creates a target-specific lint integration config.
 *
 * @param target - Lint backend to generate config for.
 * @param options - Allowed direct env reads and env boundary files.
 * @returns Config fragment for the requested target.
 */
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
