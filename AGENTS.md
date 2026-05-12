# AGENTS.md

Envy is a pnpm TypeScript monorepo. The published package is
`packages/core`, shipped as `@howells/envy`.

## Commands

Run from the repo root unless noted:

```bash
pnpm check
pnpm build
pnpm --filter @howells/envy test
pnpm --filter @howells/envy typecheck
```

CLI smoke checks:

```bash
node packages/core/dist/cli.js --help
node packages/core/dist/cli.js describe
node packages/core/dist/cli.js check local --schema ./path/to/schema.ts --from .env.production --json
```

Package publish dry-run:

```bash
cd packages/core
npm pack --dry-run --json
```

## Layout

- `packages/core/src/index.ts`: parser API.
- `packages/core/src/cli.ts`: published `envy` binary.
- `packages/core/src/*.test.ts`: parser and CLI contract tests.
- `docs/cli.md`: CLI behavior and exit-code contract.

## Boundaries

Always:

- Read files and run `pnpm check`, package tests, and `npm pack --dry-run`.
- Keep CLI JSON output machine-readable and single-line.
- Preserve semantic exit codes documented in `docs/cli.md`.
- Avoid printing env values or secrets in CLI output.

Ask first:

- Add runtime dependencies.
- Change package names, package scopes, or publish strategy.
- Remove provider adapter or Next/lint package scaffolds.

Never:

- Write secrets to `.env` files.
- Use `--no-verify` to bypass checks.
- Force-push tags or branches.
