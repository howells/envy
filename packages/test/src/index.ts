import type { EnvDefinition, EnvSchema } from "@envy/core";

/**
 * Mutable test-only store for controlled environment overrides.
 *
 * The store keeps tests from mutating global `process.env` directly and gives
 * suites a predictable reset point between cases.
 */
export interface EnvStore<TDefinition extends EnvDefinition> {
  /**
   * Schema this store belongs to.
   */
  readonly schema: EnvSchema<TDefinition>;
  /**
   * Merges override values into the current test env state.
   */
  override(values: Record<string, unknown>): void;
  /**
   * Restores the store to its initial values.
   */
  reset(): void;
  /**
   * Returns a defensive copy of current test env values.
   */
  values(): Record<string, unknown>;
}

/**
 * Creates a small in-memory env store for tests.
 *
 * Callers can pass `store.values()` into `schema.parse(...)`,
 * `schema.parseServer(...)`, or `schema.lazy(...)` without relying on import
 * order or global mutation.
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
