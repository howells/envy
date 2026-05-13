# AGENTS.md

This package is published as `@howells/envy`. Use it to define a typed
environment schema, parse explicit env input, and keep application code away
from direct `process.env` reads.

## Install

```bash
npm install @howells/envy zod
npx envy --help
```

`zod` is a peer dependency. Import Zod from the user's project.

## Correct Runtime Shape

Generate one schema module, then parse at explicit runtime boundaries.

```ts
// src/env/schema.ts
import { defineEnv } from "@howells/envy";
import { z } from "zod";

export const envSchema = defineEnv({
  server: {
    DATABASE_URL: z.string().url(),
  },
  public: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  system: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  optional: {
    SENTRY_DSN: z.string().url(),
  },
});
```

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

Application code should import `env` from the server/client env module instead
of reading `process.env` directly.

## Group Semantics

- `server`: private values required by server-side code.
- `public`: client-visible values, required by default, prefix-enforced.
- `system`: runtime or provider-owned values such as `NODE_ENV`, `CI`,
  `VERCEL_URL`, and `RAILWAY_*`.
- `optional`: values that may be absent; present values are still validated.

The default public prefix is `NEXT_PUBLIC_`. Pass `{ publicPrefix: "PUBLIC_" }`
to `defineEnv()` only when the host framework expects another prefix.

## Parser Contract

- Importing a schema has no side effects and does not validate `process.env`.
- `parse(input)` parses every group.
- `parseServer(input)` parses `server`, `public`, `system`, and `optional`.
- `parseClient(input)` parses only `public`.
- `lazy(input)` returns a proxy that validates keys on first access; prefer
  eager parse methods unless a framework phase makes eager validation awkward.
- Parsed output contains only schema-declared keys, strips unknown input keys,
  converts empty strings to `undefined` by default, and is frozen.

Invalid input throws `EnvValidationError`. Its `issues` array contains `key`,
`group`, `message`, and `path`.

## Metadata Helpers

Use `v(...)` only when tooling needs per-variable metadata. It does not change
runtime parsing.

```ts
import { defineEnv, listDeployEnvVars, v } from "@howells/envy";
import { z } from "zod";

export const envSchema = defineEnv({
  server: {
    OPENAI_API_KEY: v(z.string().min(1), {
      deploy: ["preview", "production"],
    }),
  },
});

const productionKeys = listDeployEnvVars(envSchema, {
  environment: "production",
}).map((entry) => entry.key);
```

Use `listEnvVars(envSchema)` for generated env boundaries, lint allowlists, and
agent-readable metadata. These helpers return key names and metadata, never
secret values.

## Helper Subpaths

```ts
import { loadDotenv } from "@howells/envy/dotenv";
import { syncNextEnv } from "@howells/envy/next";
import { createOxlintConfig } from "@howells/envy/lint";
import { vercel } from "@howells/envy/adapters/vercel";
import { railway } from "@howells/envy/adapters/railway";
```

- `@howells/envy/dotenv`: parse or load `.env` files without mutating global
  state unless requested.
- `@howells/envy/next`: generate client/server env files with literal public
  `process.env.NEXT_PUBLIC_*` reads for Next.js bundling.
- `@howells/envy/lint`: generate Oxlint, ESLint, or Biome config fragments that
  enforce a typed env boundary.
- `@howells/envy/adapters/vercel`: check and create Vercel env variables through
  the Vercel API.
- `@howells/envy/adapters/railway`: check and upsert Railway env variables
  through the Railway GraphQL API.

Never log or serialize provider `push({ values })` input. It contains secrets.
Adapter results expose key names only.

## CLI Contract

Use `envy describe` to inspect the machine-readable command contract.

```bash
npx envy describe
npx envy check local --schema ./src/env/schema.ts --from .env.production --json
npx envy run local --schema ./src/env/schema.ts --from .env -- node ./scripts/smoke.js
```

Schema modules may export the schema as `default`, `envSchema`, or `schema`.
Use `--export <name>` for another export.

JSON success is written to stdout as one line:

```json
{ "ok": true, "data": {}, "metadata": {} }
```

JSON errors are written to stderr as one line:

```json
{ "ok": false, "error": {}, "metadata": {} }
```

Exit codes:

- `0`: success
- `64`: usage error
- `65`: env validation failed
- `66`: schema or env file could not be read
- `70`: internal error

The CLI may print env key names but must not print env values or secrets. On
`run local` success, Envy stays silent and the child process owns stdout and
stderr. If validation fails, the child command is not started.

## Do Not

- Do not read arbitrary `process.env` keys outside the env boundary.
- Do not make optional variables `z.optional()` just because they are in the
  `optional` group.
- Do not put private secrets in the `public` group.
- Do not dynamically loop over public env keys in Next client code; use
  `parseClient({ KEY: process.env.KEY })` or `syncNextEnv()`.
- Do not print env values, dotenv contents, provider push payloads, or tokens.

## Repository Docs

When working in this repository, see:

- `../../AGENTS.md`
- `../../docs/core.md`
- `../../docs/cli.md`
- `../../docs/testing.md`
- `../../docs/next.md`
- `../../docs/lint.md`
- `../../docs/deploy.md`
