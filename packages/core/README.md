# `@howells/envy`

Zod-powered environment parsing for TypeScript applications.

Envy gives you a typed env object without import-time validation. Define a grouped schema, parse an input object, and keep application code away from raw `process.env`.

## Install

```bash
npm install @howells/envy zod
```

Or with pnpm:

```bash
pnpm add @howells/envy zod
```

`zod` is a peer dependency because Envy uses your project's Zod version for schemas and inference.

The package also installs the `envy` binary:

```bash
npx envy --help
```

## Quick Start

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

## Agent Usage Contract

When generating or editing code that uses Envy:

- Import the parser from `@howells/envy` and Zod from `zod`.
- Create one schema module that exports `envSchema`.
- Put private required keys in `server`, public client keys in `public`, runtime-owned keys in `system`, and integration keys that may be absent in `optional`.
- Parse explicit input at the runtime boundary: `parseServer(process.env)` on the server and `parseClient({ NEXT_PUBLIC_KEY: process.env.NEXT_PUBLIC_KEY })` for client bundles.
- Import the parsed `env` object from application code instead of reading `process.env` directly.
- Never print or serialize env values. CLI and adapter output should include key names only.

Minimal Next.js layout:

```ts
// src/env/schema.ts
import { defineEnv } from "@howells/envy";
import { z } from "zod";

export const envSchema = defineEnv({
  server: { DATABASE_URL: z.string().url() },
  public: { NEXT_PUBLIC_APP_URL: z.string().url() },
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

## Groups

- `server`: private values required by server-side code
- `public`: client-visible values, required by default and prefix-enforced
- `system`: runtime or provider-owned values such as `NODE_ENV` and `CI`
- `optional`: missing values are allowed, present values are validated

The default public prefix is `NEXT_PUBLIC_`.

```ts
defineEnv({
  public: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
});
```

Use a custom prefix when needed:

```ts
defineEnv(
  {
    public: {
      PUBLIC_APP_URL: z.string().url(),
    },
  },
  {
    publicPrefix: "PUBLIC_",
  },
);
```

## Parsing

Importing a schema does not read or validate `process.env`.

```ts
const env = envSchema.parse(process.env);
```

Parsed output:

- contains only schema-declared keys
- strips unknown input keys
- converts empty strings to `undefined` by default
- returns a plain frozen object

## Server And Client

For Next.js apps, keep server and client env exports separate.

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

## Optional Values

Optional variables do not need `.optional()` in the Zod schema.

```ts
const envSchema = defineEnv({
  optional: {
    SENTRY_DSN: z.string().url(),
  },
});

const env = envSchema.parse({});

env.SENTRY_DSN; // undefined
```

If a value is present, it must still pass the schema.

## Empty Strings

By default, Envy treats empty strings as missing values.

```env
SENTRY_DSN=
PORT=
```

```ts
defineEnv({
  optional: {
    SENTRY_DSN: z.string().url(),
  },
  system: {
    PORT: z.coerce.number().default(3000),
  },
});
```

`SENTRY_DSN` becomes `undefined`; `PORT` uses its default.

Disable this only when `""` is meaningful:

```ts
defineEnv(
  {
    server: {
      EMPTY_ALLOWED: z.literal(""),
    },
  },
  {
    emptyStringAsUndefined: false,
  },
);
```

## Lazy Access

Lazy mode validates declared keys when they are accessed.

```ts
const env = envSchema.lazy(process.env);
```

Prefer full parsing when you can. Use `lazy()` for framework phases, scripts, or tests where validating every declared key up front is not viable.

## CLI

Use the CLI to validate a local env file before CI or deployment:

```bash
npx envy check local --schema ./src/env/schema.ts --from .env.production
```

Your schema module can export the schema as `default`, `envSchema`, or `schema`.
Use `--export <name>` when you prefer a different named export.

```bash
npx envy check local \
  --schema ./src/env/schema.ts \
  --export appEnv \
  --from .env.production \
  --mode all
```

Omit `--from` to validate the current process environment. Use `--format json`
for CI output that another tool can parse.

`--json` is an alias for `--format json`:

```bash
npx envy check local --schema ./src/env/schema.ts --from .env.production --json
```

Use `run local` for smoke tests and scripts that should inherit validated
dotenv values:

```bash
npx envy run local --schema ./src/env/schema.ts --from .env --from .env.local -- node ./scripts/smoke.js
```

The child command only starts after validation passes.

JSON success is written to stdout:

```json
{ "ok": true, "data": {}, "metadata": {} }
```

JSON errors are written to stderr with recoverable details:

```json
{
  "ok": false,
  "error": {
    "code": "ENVY_VALIDATION_FAILED",
    "message": "Environment validation failed with 1 issue(s).",
    "suggestions": ["Set every required schema variable in the checked env source."]
  },
  "metadata": {}
}
```

Inspect the command contract programmatically:

```bash
npx envy describe
```

## Metadata

Raw Zod schemas are enough for most variables. Use `v(...)` when tooling needs per-variable metadata.

```ts
import { defineEnv, v } from "@howells/envy";

export const envSchema = defineEnv({
  server: {
    OPENAI_API_KEY: v(z.string().min(1), {
      deploy: ["preview", "production"],
    }),
  },
});
```

The parser ignores deploy metadata. Provider tooling can use it through
`listDeployEnvVars()`.

## Helper Subpaths

The package includes helper APIs for the deployment and framework edges:

```ts
import { listDeployEnvVars, listEnvVars } from "@howells/envy";
import { loadDotenv } from "@howells/envy/dotenv";
import { generateNextEnvFiles, syncNextEnv } from "@howells/envy/next";
import { createOxlintConfig } from "@howells/envy/lint";
import { vercel } from "@howells/envy/adapters/vercel";
import { railway } from "@howells/envy/adapters/railway";
```

- `listEnvVars()`: schema metadata for generated code, allowlists, and docs
- `listDeployEnvVars()`: deploy-relevant keys after applying `v(..., { deploy })`
- `@howells/envy/dotenv`: `.env` loading without shelling out
- `@howells/envy/next`: generated Next client/server env boundaries
- `@howells/envy/lint`: Oxlint, ESLint, and Biome config helpers
- `@howells/envy/adapters/vercel`: Vercel env presence checks and API pushes
- `@howells/envy/adapters/railway`: Railway env presence checks and API pushes

Use metadata helpers when building agents, CI checks, or provider workflows:

```ts
const publicKeys = listEnvVars(envSchema, { groups: ["public"] }).map(
  (entry) => entry.key,
);

const productionKeys = listDeployEnvVars(envSchema, {
  environment: "production",
}).map((entry) => entry.key);
```

## Errors

Invalid input throws `EnvValidationError`.

```ts
import { EnvValidationError } from "@howells/envy";

try {
  envSchema.parse(process.env);
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.issues);
  }
}
```

Each issue includes:

- `key`
- `group`
- `message`
- `path`

## Tests

Test with plain objects instead of mutating global `process.env`.

```ts
const env = envSchema.parseServer({
  DATABASE_URL: "https://db.example.com",
  OPENAI_API_KEY: "test-key",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
});
```

This avoids import-order problems and keeps env state local to the test.

## Repository

GitHub: [howells/envy](https://github.com/howells/envy)
