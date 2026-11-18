/**
 * Structured provider check result.
 */
export interface ProviderCheckResult {
  /** Variables present in the provider. */
  readonly present: readonly string[];
  /** Variables missing from the provider. */
  readonly missing: readonly string[];
}

/** Splits the requested keys by whether the provider already has them. */
export function checkKeys(
  keys: readonly string[],
  existing: ReadonlySet<string>,
): ProviderCheckResult {
  return {
    missing: keys.filter((key) => !existing.has(key)),
    present: keys.filter((key) => existing.has(key)),
  };
}
