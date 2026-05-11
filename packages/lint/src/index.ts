/**
 * Lint integration helpers for enforcing the typed env boundary.
 *
 * Envy treats direct `process.env` access as an escape hatch that should be
 * banned everywhere except the generated or hand-authored env boundary. This
 * package will emit provider-specific configuration for Oxlint, Biome, and
 * ESLint so teams can keep their existing formatter/linter choices.
 *
 * @module
 */

/**
 * Lint systems Envy can generate integration config for.
 *
 * Oxlint is the preferred enforcement target because it can run standalone
 * alongside Biome formatting. Biome and ESLint support remain part of the API
 * plan for teams that already standardize on those tools.
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
   * Everything else should be imported from the typed env module.
   */
  allowedVariables?: readonly string[];
  /**
   * Files that define the typed env surface and should be exempted.
   *
   * The env boundary itself must read from `process.env`; application modules
   * should not. Generated lint config can use these paths for overrides.
   */
  envFiles?: readonly string[];
}

/**
 * Creates the preferred Oxlint configuration for banning direct `process.env`.
 *
 * Envy relies on Oxlint's native `node/no-process-env` rule first because it is
 * fast, standalone, and works cleanly alongside Biome formatting.
 *
 * @param options - Variables and files allowed to use direct env access.
 * @returns An Oxlint config fragment that enables `node/no-process-env`.
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
 *
 * @param _target - Lint backend to generate config for.
 * @param _options - Variables and files allowed to use direct env access.
 * @returns A linter-specific config object once implemented.
 * @throws Error until the non-Oxlint integration generator is added.
 */
export function createLintIntegration(
  _target: LintTarget,
  _options: LintIntegrationOptions = {},
): unknown {
  throw new Error("@envy/lint createLintIntegration is not implemented yet.");
}
