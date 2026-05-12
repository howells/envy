/**
 * Lint helpers for enforcing an Envy env boundary.
 *
 * Direct `process.env` access should be limited to generated or hand-authored
 * env boundary files. These helpers generate config fragments for common lint
 * setups without taking over the rest of a project's lint configuration.
 *
 * @module
 */

/**
 * Lint systems Envy can generate config for.
 */
export type LintTarget = "biome" | "eslint" | "oxlint";

/**
 * Options shared by lint integrations.
 */
export interface LintIntegrationOptions {
  /**
   * Env variable names that may still be read directly from `process.env`.
   *
   * Typical examples are runtime-owned keys such as `NODE_ENV` and `CI`.
   */
  readonly allowedVariables?: readonly string[];
  /**
   * Files that define the env boundary and may read `process.env`.
   */
  readonly envFiles?: readonly string[];
}

/**
 * Creates an Oxlint config fragment using its native `node/no-process-env` rule.
 *
 * @param options - Allowed variables and env boundary files.
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
  const message =
    "Import the typed env module instead of reading process.env directly.";

  return [
    {
      ignores: [...(options.envFiles ?? [])],
      rules: {
        "no-restricted-properties": [
          "error",
          {
            message,
            object: "process",
            property: "env",
          },
        ],
      },
    },
  ];
}

/**
 * Creates a Biome companion config fragment.
 *
 * Biome does not currently provide the same schema-aware `process.env` rule as
 * Oxlint or ESLint, so this helper returns the narrow config Envy can own:
 * generated env files are excluded from Biome diagnostics, while process-env
 * enforcement should run through Oxlint or ESLint.
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
 * Creates a lint integration config for a supported target.
 *
 * @param target - Lint backend to generate config for.
 * @param options - Allowed direct env reads and boundary files.
 * @returns Target-specific config fragment.
 */
export function createLintIntegration(
  target: LintTarget,
  options: LintIntegrationOptions = {},
): unknown {
  if (target === "oxlint") {
    return createOxlintConfig(options);
  }

  if (target === "eslint") {
    return createEslintConfig(options);
  }

  return createBiomeConfig(options);
}

function createEnvFileOverrides(
  envFiles: readonly string[] | undefined,
): readonly Record<string, unknown>[] {
  if (!envFiles || envFiles.length === 0) {
    return [];
  }

  return [
    {
      files: envFiles,
      rules: {
        "node/no-process-env": "off",
      },
    },
  ];
}
