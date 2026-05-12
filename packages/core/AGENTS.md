# AGENTS.md

This package is published as `@howells/envy`. It exposes the parser API and the
`envy` CLI binary.

## Install

```bash
npm install @howells/envy zod
npx envy --help
```

## CLI Contract

Use `envy describe` to inspect the machine-readable command contract.

```bash
npx envy describe
npx envy check local --schema ./src/env/schema.ts --from .env.production --json
```

JSON success is written to stdout:

```json
{ "ok": true, "data": {}, "metadata": {} }
```

JSON errors are written to stderr:

```json
{ "ok": false, "error": {}, "metadata": {} }
```

Exit codes:

- `0`: success
- `64`: usage error
- `65`: env validation failed
- `66`: schema or env file unreadable
- `70`: internal error

The CLI prints env key names but must not print secret values.
