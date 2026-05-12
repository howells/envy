# Envy

Zod-powered environment parsing for TypeScript apps, with a CLI for local checks, lint helpers, Next.js env generation, and Vercel/Railway env checks and pushes.

Application code imports a typed env object instead of reading `process.env` directly. Validation runs when you ask for it, tests can pass plain objects, and deploy checks catch missing or misspelled variables before a deploy starts.

`@howells/envy` includes the parser, the `envy check local` CLI, dotenv helpers, Next.js codegen helpers, lint helpers, and Vercel/Railway provider adapters.

## Why

Env bugs are usually small mistakes with expensive timing:

- a required secret is missing in production
- a key is misspelled in `.env.production`
- a public variable is not prefixed correctly for Next.js
- tests fail because env validation ran at import time
- deployment scripts corrupt secrets with shell quoting or trailing newlines
- application code quietly bypasses the typed env module with `process.env`

The schema is the source of truth:

```ts
import { defineEnv } from "@howells/envy";
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

The core parser is published on npm as `@howells/envy`. Install it with Zod:

```bash
npm install @howells/envy zod
```

That also installs the `envy` binary:

```bash
npx envy --help
```

Or with pnpm:

```bash
pnpm add @howells/envy zod
pnpm exec envy --help
```

For this workspace:

```bash
pnpm install
pnpm check
pnpm build
```

## Core Concepts

### Grouped Schema

Groups tell the parser and helper tools how each key behaves:

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
- `public`: client-visible, required by default, prefix-enforced
- `system`: runtime/provider-owned values, excluded from deploy pushes by default
- `optional`: missing is allowed, present values are validated

The default public prefix is `NEXT_PUBLIC_`.

### Explicit Parsing

Importing a schema does not validate the process environment.

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

Lazy access is for runtimes and tests that cannot validate every key up front:

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

## CLI

The published package includes a working local preflight command:

```bash
npx envy check local --schema ./src/env/schema.ts --from .env.production
```

Omit `--from` to validate the current process environment:

```bash
npx envy check local --schema ./src/env/schema.ts
```

Use `--mode server`, `--mode client`, or `--mode all` to choose the parser method. The default is `server`.

```bash
npx envy check local --schema ./src/env/schema.ts --from .env.production --mode all
```

For agents and CI, use structured output and command introspection:

```bash
npx envy check local --schema ./src/env/schema.ts --from .env.production --json
npx envy describe
```

JSON output uses a stable envelope:

```json
{ "ok": true, "data": {}, "metadata": {} }
```

Errors use the same shape on stderr and semantic exit codes:

- `64`: usage error
- `65`: env validation failed
- `66`: schema or env file could not be read
- `70`: internal error

See [CLI Guide](./docs/cli.md), [Deploy Guide](./docs/deploy.md), and [Lint Guide](./docs/lint.md).

## Helper Subpaths

The published package also exposes helper APIs:

```ts
import { loadDotenv } from "@howells/envy/dotenv";
import { syncNextEnv } from "@howells/envy/next";
import { createOxlintConfig } from "@howells/envy/lint";
import { vercel } from "@howells/envy/adapters/vercel";
import { railway } from "@howells/envy/adapters/railway";
```

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
