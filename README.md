# Envy

Zod-powered environment parsing for TypeScript apps, with a path toward lint enforcement, Next.js env generation, deploy preflight checks, and safe provider pushes.

Envy starts from a simple rule: application code should import a typed env object, not read `process.env` directly. Validation is explicit, tests stay ergonomic, and deployment checks should catch missing or misspelled variables before a deploy starts.

> Current status: `@envy/core` is implemented and tested. CLI, provider adapters, Next codegen, dotenv loading, and lint helpers are scaffolded with documented public surfaces and will be filled in next.

## Why

Env bugs are usually boring and expensive:

- a required secret is missing in production
- a key is misspelled in `.env.production`
- a public variable is not prefixed correctly for Next.js
- tests fail because env validation ran at import time
- deployment scripts corrupt secrets with shell quoting or trailing newlines
- application code quietly bypasses the typed env module with `process.env`

Envy is designed to make the happy path explicit:

```ts
import { defineEnv } from "@envy/core";
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
  },

  optional: {
    COHERE_API_KEY: z.string().min(1),
  },
});

export const env = envSchema.parseServer(process.env);
```

## Install

This repository is still local scaffold work. Once published, the core install shape should be:

```bash
pnpm add @envy/core zod
```

For this workspace:

```bash
pnpm install
pnpm check
pnpm build
```

## Core Concepts

### Grouped Schema

Envy uses grouped authoring because the group tells tools how each key should behave:

```ts
defineEnv({
  server: {
    DATABASE_URL: z.string().url(),
  },
  public: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  system: {
    CI: z.coerce.boolean().default(false),
  },
  optional: {
    SENTRY_DSN: z.string().url(),
  },
});
```

- `server`: private, required by default
- `public`: client-safe, required by default, prefix-enforced
- `system`: runtime/provider-owned values, excluded from deploy pushes by default
- `optional`: missing is allowed, present values are validated

The default public prefix is `NEXT_PUBLIC_`.

### Explicit Parsing

Parsing is explicit. Importing a schema does not validate the process environment.

```ts
const env = envSchema.parse(process.env);
```

Parsed output:

- contains only schema-declared keys
- strips unknown input keys
- converts empty strings to `undefined` by default
- returns a plain frozen object

### Server And Client Parsing

Use separate exports in Next.js apps:

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

`parseServer()` includes `server`, `public`, `system`, and `optional` keys. `parseClient()` includes only `public` keys.

### Lazy Access

Lazy access is an escape hatch for awkward runtimes and tests:

```ts
const env = envSchema.lazy(process.env);
```

`lazy()` validates a key when that key is accessed. Prefer explicit parsing when possible.

## Testing

Test env behavior with plain objects. Do not mutate global `process.env` unless a test specifically needs to cover process integration.

```ts
const env = envSchema.parseServer({
  DATABASE_URL: "https://db.example.com",
  OPENAI_API_KEY: "test-key",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
});
```

For mutable test state:

```ts
import { createEnvStore } from "@envy/test";

const store = createEnvStore(envSchema, {
  DATABASE_URL: "https://db.example.com",
});

store.override({ OPENAI_API_KEY: "test-key" });
store.reset();
```

See [Testing Guide](./docs/testing.md).

## Planned CLI

The CLI command surface is scaffolded:

```bash
envy check local --from .env.production
envy check vercel --project web --environment production
envy check railway --project sorrel --service web --environment production

envy push vercel --from .env.production --environment production --dry-run
envy push railway --from .env.production --service web --environment production --dry-run

envy init next
envy sync next
envy init lint --target oxlint
```

See [CLI Guide](./docs/cli.md), [Deploy Guide](./docs/deploy.md), and [Lint Guide](./docs/lint.md).

## Package Layout

```txt
packages/
  core/                 # defineEnv, parsing, metadata, type model
  cli/                  # envy binary, config loading, check/push/init/sync
  config/               # defineConfig for envy.config.ts
  dotenv/               # .env parser/loading helpers
  next/                 # Next init/sync/codegen helpers
  test/                 # test helpers
  lint/                 # oxlint/biome/eslint config helpers
  adapters/
    vercel/             # Vercel check/push
    railway/            # Railway check/push
```

## Development

```bash
pnpm install
pnpm check
pnpm build
```

The repo uses:

- pnpm workspaces
- `@howells/lint`
- `@howells/typescript-config`
- tsup
- Vitest
- TypeScript

## Docs

- [Core API](./docs/core.md)
- [Testing Guide](./docs/testing.md)
- [Next.js Guide](./docs/next.md)
- [Lint Guide](./docs/lint.md)
- [Deploy Guide](./docs/deploy.md)
- [CLI Guide](./docs/cli.md)
