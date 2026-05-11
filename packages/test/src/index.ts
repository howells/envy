import type { EnvDefinition, EnvSchema } from "@howells/envy";

/**
 * Test helpers for exercising Envy schemas without mutating global state.
 *
 * This package exists because direct `process.env` mutation is one of the
 * easiest ways for environment validation to become frustrating in test suites.
 * The store API keeps each test's inputs explicit and resettable.
 *
 * @example
 * ```ts
 * const store = createEnvStore(envSchema, {
 *   DATABASE_URL: "postgres://user:pass@localhost:5432/app",
 * });
 *
 * store.override({ FEATURE_FLAG: "true" });
 * const env = envSchema.parseServer(store.values());
 * store.reset();
 * ```
 *
 * @module
 */

/**
 * Mutable test-only store for controlled environment overrides.
 *
 * The store keeps tests from mutating global `process.env` directly and gives
 * suites a predictable reset point between cases.
 */
export interface EnvStore<TDefinition extends EnvDefinition> {
  /**
   * Schema this store belongs to.
   *
   * Keeping the schema attached makes helper assertions and future fixture
   * builders able to inspect the expected env surface.
   */
  readonly schema: EnvSchema<TDefinition>;
  /**
   * Merges override values into the current test env state.
   *
   * Overrides are shallow by design because env values are flat strings in real
   * deployments. Passing `undefined` deliberately simulates a missing value.
   *
   * @param values - Raw env-like values to merge into the store.
   */
  override(values: Record<string, unknown>): void;
  /**
   * Restores the store to its initial values.
   *
   * Call this from test framework cleanup hooks when a suite shares a store.
   */
  reset(): void;
  /**
   * Returns a defensive copy of current test env values.
   *
   * Mutating the returned object cannot alter the store, which keeps parse
   * inputs explicit across assertions.
   *
   * @returns A shallow copy suitable for `schema.parse(...)`.
   */
  values(): Record<string, unknown>;
}

/**
 * Creates a small in-memory env store for tests.
 *
 * Callers can pass `store.values()` into `schema.parse(...)`,
 * `schema.parseServer(...)`, or `schema.lazy(...)` without relying on import
 * order or global mutation.
 *
 * @param schema - Envy schema under test.
 * @param initialValues - Starting raw env values for the store.
 * @returns A mutable store with resettable overrides.
 */
export function createEnvStore<TDefinition extends EnvDefinition>(
  schema: EnvSchema<TDefinition>,
  initialValues: Record<string, unknown>,
): EnvStore<TDefinition> {
  let currentValues = { ...initialValues };

  return {
    schema,
    override(values) {
      currentValues = { ...currentValues, ...values };
    },
    reset() {
      currentValues = { ...initialValues };
    },
    values() {
      return { ...currentValues };
    },
  };
}
