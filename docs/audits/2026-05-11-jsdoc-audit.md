# JSDoc Audit - 2026-05-11

## Scope

Focused audit of Envy's public TypeScript API documentation after the initial
`@howells/envy` publish. This pass covered every exported source surface in the
workspace, with emphasis on the core parser package and the scaffold packages
that define future CLI, lint, Next.js, test, dotenv, Vercel, and Railway APIs.

## Result

Status: pass after remediation.

The exported API now has module-level documentation, stronger type and interface
comments, parameter and return notes for public functions, behavior notes for
validation and lazy parsing, and examples on the primary authoring helpers.

## Changes Made

- Expanded `packages/core/src/index.ts` with reference-grade docs for schema
  groups, deploy metadata, parser options, inferred env types, structured
  validation errors, `defineEnv`, and `v`.
- Added richer module and function JSDoc to scaffold packages so future
  implementation work has a documented contract to preserve.
- Clarified deploy adapter safety requirements: checks are read-only, pushes
  must only write schema-defined variables, and secret values must not be
  printed.
- Updated the published package type export to point at generated declarations
  rather than TypeScript source.

## Residual Risks

- Several helper packages are still scaffolds and intentionally throw
  unimplemented errors. Their docs now describe the intended contract, but those
  contracts still need implementation tests when work begins.
- Generated declaration quality should be verified in the build output because
  npm consumers receive `dist/index.d.ts` for editor hover docs.
- The CLI command registry documents the intended surface, but command behavior
  remains future work.

## Scorecard

- API surface documented: strong
- Core parser examples: strong
- Deploy safety contract docs: strong
- Scaffold implementation readiness: moderate
- Remaining documentation risk: low for core, moderate for unimplemented
  packages
