# CLI Guide

The `envy` CLI ships with `@howells/envy`.

```bash
npm install @howells/envy zod
npx envy --help
```

It currently provides a working local preflight check for validating
`process.env` or dotenv files against an Envy schema before CI or deployment
continues.

## Config

`envy.config.ts` is reserved for future commands. The implemented local check is
explicit and takes `--schema`.

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
npx envy check local --schema ./src/env/schema.ts --from .env.production --format json
```

When `--from` is omitted, the CLI validates the current process environment.
When one or more `--from` files are provided, files are parsed and merged in
order without mutating `process.env`.

The dotenv parser supports common syntax: comments, blank lines, `export KEY=`,
single-quoted values, double-quoted values, inline comments after unquoted
values, and empty values. It does not append newlines to secrets.

## Future Commands

Provider checks, safe provider pushes, Next codegen, and lint initialization are
still separate implementation tracks:

```bash
envy check vercel
envy check railway
envy push vercel
envy push railway
envy init next
envy sync next
envy init lint
```

## Exit Codes

- `0`: success
- `1`: validation failure, config error, missing file, unknown command, or usage error

## Output Rules

CLI output should:

- show key names
- never show secret values
- include enough context to fix the problem without opening provider dashboards
- support JSON output for CI
