# Deploy Guide

Deploy support is available through provider adapters.

The goal is to catch env drift before a deploy starts, then safely push schema-declared variables without shell quoting mistakes.

## Providers

V1 targets:

- Vercel
- Railway

## Check Before Deploy

```ts
import { listDeployEnvVars } from "@howells/envy";
import { vercel } from "@howells/envy/adapters/vercel";

const keys = listDeployEnvVars(envSchema, {
  environment: "production",
}).map((entry) => entry.key);

const result = await vercel({ project: "web" }).check({
  environment: "production",
  keys,
});
```

Checks should verify presence of deploy-relevant variables:

- include `server`
- include `public`
- include `optional` only when explicitly marked deploy-required
- exclude `system` by default

Provider APIs may not expose secret values. Presence checks should still work. Value validation should run only when values are safely readable.

Example report:

```txt
Vercel production
✓ DATABASE_URL present
✓ OPENAI_API_KEY present
✕ NEXT_PUBLIC_APP_URL missing
- DATABASE_URL value is not readable, schema format not validated
- OPENAI_API_KEY value is not readable, schema format not validated
```

## Safe Push

```ts
import { loadDotenv } from "@howells/envy/dotenv";
import { railway } from "@howells/envy/adapters/railway";

const values: Record<string, string | undefined> = {};
loadDotenv([".env.production"], { processEnv: values });

await railway({
  environmentId: "env_id",
  projectId: "project_id",
  serviceId: "service_id",
}).push({
  dryRun: true,
  values: Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string"
    ),
  ),
});
```

Push should:

- parse `.env` with a real parser
- use provider API first
- use provider APIs directly
- push schema-declared keys only
- fail on undeclared keys by default
- exclude `system` keys by default
- push optional keys only when present
- never print secret values
- skip existing remote vars unless `--overwrite`
- refuse deletes in v1

## Why Not Shell Pipes

Secrets are easy to corrupt with shell commands:

```bash
echo "$SECRET" | vercel env add SECRET production
```

This can accidentally add trailing newlines or mishandle multiline values. Envy pushes exact parsed values through structured provider APIs.

## Local Checks

```bash
envy check local --from .env.production
```

By default this validates the file alone and fails if:

- a required deploy key is missing
- a key is undeclared
- a readable value fails its Zod schema

Merging with the current process environment should be explicit:

```bash
envy check local --from .env.production --with-process-env
```

In merged mode, `process.env` wins over file values.
