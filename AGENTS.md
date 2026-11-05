# Envy

pnpm TypeScript monorepo. The published package is `packages/core`, shipped as `@howells/envy`.

## Commands

```bash
pnpm build
pnpm test
pnpm typecheck
pnpm --filter @howells/envy test
node packages/core/dist/cli.js --help
```

## Layout

- `packages/core/src/index.ts`: parser API.
- `packages/core/src/cli.ts`: published `envy` binary.
- `packages/core/src/*.test.ts`: parser and CLI contract tests.
- `docs/cli.md`: CLI behavior and exit-code contract.

## Rules

- Keep CLI JSON output machine-readable and single-line; preserve the exit codes in `docs/cli.md`.
- Never print env values or secrets in CLI output, and never write secrets to `.env` files.
- Ask before adding runtime dependencies or changing package names, scopes or publish strategy.
- Releases publish from a `v*` tag via `.github/workflows/release.yml`. Never force-push tags or branches.
- Don't overwrite other people's uncommitted work.
