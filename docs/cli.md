# CLI Guide

The `envy` CLI ships with `@howells/envy`.

```bash
npm install @howells/envy zod
npx envy --help
npx envy describe
```

It provides a working local preflight check for validating
`process.env` or dotenv files against an Envy schema before CI or deployment
continues.

## Config

`envy.config.ts` gives project defaults a typed home. The local check remains
explicit and accepts `--schema` for monorepos and one-off checks.

```ts
import { defineConfig } from "@envy/config";

export default defineConfig({
  schema: "./src/env/schema.ts",
  envDir: ".",
  defaultTarget: "vercel",
});
```

Use a schema path for monorepos and one-off checks.

```bash
envy check local --schema apps/web/src/env/schema.ts --from apps/web/.env.production
```

## Commands

### `envy check local`

Validate a local env source against the schema.

```bash
npx envy check local --schema ./src/env/schema.ts --from .env.production
npx envy check local --schema ./src/env/schema.ts
npx envy check local --schema ./src/env/schema.ts --from .env --from .env.local
```

The schema module may export the schema as:

- `default`
- `envSchema`
- `schema`

Use `--export <name>` for any other export:

```bash
npx envy check local --schema ./src/env/schema.ts --export appEnv
```

Modes map directly to parser methods:

- `--mode server`: `schema.parseServer(input)`, the default
- `--mode client`: `schema.parseClient(input)`
- `--mode all`: `schema.parse(input)`

```bash
npx envy check local --schema ./src/env/schema.ts --from .env.production --mode all
```

JSON output is available for CI:

```bash
npx envy check local --schema ./src/env/schema.ts --from .env.production --json
```

`--json` is an alias for `--format json`. Success writes a single-line JSON
envelope to stdout:

```json
{ "ok": true, "data": {}, "metadata": {} }
```

Errors write the same envelope shape to stderr:

```json
{ "ok": false, "error": {}, "metadata": {} }
```

Run `envy describe` or `envy check local --describe` to inspect supported
commands, flags, output shapes, and exit codes without scraping prose docs.

When `--from` is omitted, the CLI validates the current process environment.
When one or more `--from` files are provided, files are parsed and merged in
order without mutating `process.env`.

The dotenv parser supports common syntax: comments, blank lines, `export KEY=`,
single-quoted values, double-quoted values, inline comments after unquoted
values, and empty values. It does not append newlines to secrets.

### `envy run local`

Validate env first, then run a command with the checked dotenv files loaded into
the child process environment.

```bash
npx envy run local --schema ./src/env/schema.ts --from .env --from .env.local -- node ./scripts/smoke.js
```

Files passed with `--from` are parsed in order; later files override earlier
files. The current process environment wins over file values, so CI-injected
secrets are not replaced by local dotenv files. On success, Envy writes no
output of its own; stdout and stderr belong to the child process. If validation
fails, the command is not started.

## Helper APIs

Provider checks, safe provider pushes, Next codegen, dotenv loading, and lint
configuration are available as package subpaths:

```ts
import { loadDotenv } from "@howells/envy/dotenv";
import { syncNextEnv } from "@howells/envy/next";
import { createLintIntegration } from "@howells/envy/lint";
import { vercel } from "@howells/envy/adapters/vercel";
import { railway } from "@howells/envy/adapters/railway";
```

## Exit Codes

- `0`: success
- `64`: usage error, unknown command, invalid flag, or invalid path
- `65`: env validation failed
- `66`: schema or env file could not be read
- `70`: internal error

## Output Rules

CLI output:

- show key names
- never show secret values
- include enough context to fix the problem without opening provider dashboards
- support JSON output for CI
- reject paths containing NUL bytes or terminal control characters
