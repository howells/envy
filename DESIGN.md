# Envy Design Notes

Envy is a Zod-powered environment parser first. It should make typed environment access pleasant in application code, while offering optional helpers for lint enforcement, test ergonomics, deploy preflight checks, and safe provider writes.

The goal is not to recreate `t3-env` exactly. The useful part to keep is grouped server/public/system intent. The pain to avoid is import-time validation and awkward test/build behavior.

## Core Principles

- Validation is explicit by default.
- Core validates any object passed to it; `.env` file loading is an opt-in helper.
- Zod is the value validator.
- Empty strings are treated as `undefined` by default.
- Tests get explicit helpers rather than hidden `NODE_ENV=test` behavior.
- Lazy validation exists as an escape hatch, not the default.
- Next.js is the first-class app target in v1.
- Deploy integrations should check and safely push schema-declared variables.
- The repository is a pnpm monorepo using `@howells/lint` and `@howells/typescript-config`.

## Package Layout

```txt
packages/
  core/                 # defineEnv, parsing, metadata, type model
  cli/                  # envy binary, config loading, check/push/init/sync
  config/               # defineConfig for envy.config.ts
  dotenv/               # .env parser/loading helpers
  next/                 # Next init/sync/codegen helpers
  test/                 # parseTest/createEnvStore helpers
  lint/                 # oxlint/biome/eslint config helpers
  adapters/
    vercel/             # check/push Vercel
    railway/            # check/push Railway
```

Development baseline:

- pnpm workspaces
- `@howells/lint`
- `@howells/typescript-config`
- tsup
- Vitest
- TypeScript project references where useful

## Canonical API

```ts
import { defineEnv, v } from "envy";
import { z } from "zod";

export const envSchema = defineEnv({
  server: {
    DATABASE_URL: z.string().url(),
    OPENAI_API_KEY: z.string().min(1),
  },

  public: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },

  system: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    CI: z.coerce.boolean().default(false),
  },

  optional: {
    COHERE_API_KEY: z.string().min(1),
  },
});
```

`v(...)` is reserved for per-variable overrides:

```ts
server: {
  OPENAI_API_KEY: v(z.string().min(1), {
    deploy: ["preview", "production"],
  }),
}
```

## Group Semantics

- `server`: private, required by default, included in deploy checks and pushes.
- `public`: client-safe, required by default, prefix-enforced, included in deploy checks and pushes.
- `system`: parseable runtime/system values, excluded from deploy checks and pushes by default.
- `optional`: missing is allowed; present non-empty values must pass the schema. Optional values are pushed only when present in the source env file.

The default public prefix is `NEXT_PUBLIC_`. Other frameworks can override it later with `publicPrefix`, but v1 should not try framework auto-detection.

## Parsing

Preferred explicit parsing:

```ts
export const env = envSchema.parse(process.env);
```

Explicit parsing returns a plain frozen object. After parsing succeeds, there should be no proxy behavior or hidden reads from `process.env`.

Parsed output contains only schema-declared keys. Unknown keys from the input object are stripped from the returned object. Separate CLI diagnostics such as `envy doctor` can report unknown or stale env vars, but application code should not receive them through the typed env surface.

Server/client split for Next:

```ts
// src/env/server.ts
import { envSchema } from "./schema";

export const env = envSchema.parseServer(process.env);
```

```ts
// src/env/client.ts
import { envSchema } from "./schema";

export const env = envSchema.parseClient({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
```

`parseServer()` returns `server`, `public`, `system`, and `optional` values. Server code often needs public URLs and publishable keys too. `parseClient()` returns `public` values only. `parse()` returns everything and is mainly for non-Next or server-only contexts.

Lazy validation should exist for awkward runtimes:

```ts
export const env = envSchema.lazy(process.env);
```

Lazy mode validates keys on access, remains explicitly named, and uses a proxy.

## Dotenv Loading

Core does not load `.env` files. Loading is opt-in:

```ts
import { loadDotenv } from "envy/dotenv";

loadDotenv([".env.local", ".env"]);
const env = envSchema.parse(process.env);
```

This keeps tests and CLI tools free to pass plain objects.

## Test Support

Tests should use explicit helpers:

```ts
const env = envSchema.parseTest({
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
});
```

```ts
import { createEnvStore } from "envy/test";

const store = createEnvStore(envSchema, {
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
});

store.override({ OPENAI_API_KEY: "test-key" });
store.reset();
```

Normal parsing should not weaken validation automatically in `NODE_ENV=test`.

## Next.js Support

V1 should include Next-specific helpers under `envy/next`.

Client env mapping should be generated, not reflected dynamically, because Next.js client env replacement expects explicit `process.env.NEXT_PUBLIC_*` access.

Commands:

```bash
envy init next
envy sync next
```

Generated layout:

```txt
src/env/schema.ts
src/env/server.ts
src/env/client.ts
```

## Lint Enforcement

The preferred v1 enforcement path is Oxlint.

Oxlint already provides native `node/no-process-env` with `allowedVariables`, so `envy` should rely on that before building a custom linter rule.

```jsonc
{
  "plugins": ["node"],
  "rules": {
    "node/no-process-env": [
      "error",
      {
        "allowedVariables": ["NODE_ENV", "CI"]
      }
    ]
  }
}
```

Commands:

```bash
envy init lint --target oxlint
envy init lint --target biome
envy init lint --target eslint
```

Biome support should be offered as a simpler companion because Biome GritQL plugins are currently pattern-diagnostic based. ESLint support can be added for teams that still need precise rule behavior or Oxlint compatibility gaps.

## Deploy Checks

V1 adapters:

- Vercel
- Railway

Deploy checks should use provider APIs first and CLI fallback second.

Auth resolution:

1. Explicit token passed to the adapter.
2. Provider environment variables such as `VERCEL_TOKEN`, `RAILWAY_API_TOKEN`, or `RAILWAY_TOKEN`.
3. Local CLI fallback when installed and authenticated.
4. Clear failure if no auth path is available.

Checks validate presence by default and validate values only when values are safely readable.

Example:

```txt
Vercel production
✓ DATABASE_URL present
✓ OPENAI_API_KEY present
✕ NEXT_PUBLIC_APP_URL missing
- DATABASE_URL value is not readable, schema format not validated
- OPENAI_API_KEY value is not readable, schema format not validated
```

## Safe Push

V1 should include safe provider writes because ad hoc shell-based secret pushing is easy to corrupt with quoting, newlines, and multiline values.

Commands:

```bash
envy push vercel --from .env.production --environment production --dry-run
envy push vercel --from .env.production --environment production --yes
envy push railway --from .env.production --service web --environment production --dry-run
```

Rules:

- Parse `.env` with a real parser, never shell `echo`.
- Use provider API first, CLI fallback second.
- Push only schema-declared keys.
- Fail by default if the source env file contains undeclared keys. This catches misspellings such as `OPEN_AI_API_KEY` before a required `OPENAI_API_KEY` is silently skipped.
- Exclude `system` keys by default.
- Push `optional` keys only when present in the source file.
- Show key names only, never secret values.
- Refuse to delete remote vars in v1.
- Skip existing remote keys unless `--overwrite`.
- Support `--only KEY` and `--except KEY`.
- Support an explicit undeclared-key escape hatch such as `--allow-undeclared`.
- Produce an audit summary.

Example output:

```txt
Vercel production
+ OPENAI_API_KEY will be created
~ DATABASE_URL exists, skipped without --overwrite
✓ NEXT_PUBLIC_APP_URL already present

No values printed.
```

## Open Questions

- Package structure and build system.
- Exact TypeScript type model for grouped schema flattening.
- Error formatting and exit codes.
- CLI config discovery rules.
- Provider API implementation details for Vercel and Railway.
- Whether safe push should support multiline secret fixtures in tests from day one.

## Local Checks

Local checks validate source env files against the schema and are strict about undeclared keys by default.

```bash
envy check local --from .env.production
```

By default, `--from .env.production` validates that file alone. It must contain all required deploy-relevant keys.

Process environment merging is explicit:

```bash
envy check local --from .env.production --with-process-env
```

In merged mode, `process.env` wins over file values. This matches CI and provider behavior where injected environment variables override file defaults.

Process-only validation is also explicit:

```bash
envy check local --from process
```

An undeclared key is an error, not a warning, because the core product goal is preventing deploy failures caused by drift, stale config, or misspelled variables.

```txt
Unknown env key OPEN_AI_API_KEY in .env.production.
Did you mean OPENAI_API_KEY?
```

An explicit escape hatch can be provided for migration or provider-specific files:

```bash
envy check local --from .env.production --allow-undeclared
```

## CLI Config

V1 should support both config discovery and explicit command flags.

Generated config:

```ts
import { defineConfig } from "envy/config";

export default defineConfig({
  schema: "./src/env/schema.ts",
  envDir: ".",
  defaultTarget: "vercel",
});
```

Every CLI command should also accept `--schema` for monorepos and one-off checks:

```bash
envy check local --schema apps/web/src/env/schema.ts --from apps/web/.env.production
```
