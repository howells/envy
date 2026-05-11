/**
 * Lint systems Envy can generate integration config for.
 */
export type LintTarget = "oxlint" | "biome" | "eslint";

/**
 * Options shared by generated lint integrations.
 */
export interface LintIntegrationOptions {
  /**
   * Env variables that may still be accessed through `process.env`.
   *
   * Typical examples are runtime/system keys such as `NODE_ENV` and `CI`.
   */
  allowedVariables?: readonly string[];
  /**
   * Files that define the typed env surface and should be exempted.
   */
  envFiles?: readonly string[];
}

/**
 * Creates the preferred Oxlint configuration for banning direct `process.env`.
 *
 * Envy relies on Oxlint's native `node/no-process-env` rule first because it is
 * fast, standalone, and works cleanly alongside Biome formatting.
 */
export function createOxlintConfig(
  options: LintIntegrationOptions = {},
): unknown {
  return {
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
 * Creates lint integration config for a supported target.
 *
 * This will become the common entry point used by `envy init lint`.
 */
export function createLintIntegration(
  _target: LintTarget,
  _options: LintIntegrationOptions = {},
): unknown {
  throw new Error("@envy/lint createLintIntegration is not implemented yet.");
}
