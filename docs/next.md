# Next.js Guide

Envy v1 is Next-first. The default public prefix is `NEXT_PUBLIC_`, and the recommended layout separates schema, server env, and client env.

## Recommended Layout

```txt
src/env/schema.ts
src/env/server.ts
src/env/client.ts
```

## Schema

```ts
// src/env/schema.ts
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
});
```

## Server Env

```ts
// src/env/server.ts
import { envSchema } from "./schema";

export const env = envSchema.parseServer(process.env);
```

Server parsing includes `server`, `public`, `system`, and `optional` keys.

## Client Env

```ts
// src/env/client.ts
import { envSchema } from "./schema";

export const env = envSchema.parseClient({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
```

Client parsing includes only public keys.

## Why Client Mapping Is Explicit

Next.js expects public env access to be statically visible:

```ts
process.env.NEXT_PUBLIC_APP_URL
```

A dynamic loop over schema keys is tempting, but it risks values not being inlined into the client bundle. `syncNextEnv()` generates explicit mappings instead of relying on runtime reflection.

## Codegen

```ts
import { syncNextEnv } from "@howells/envy/next";
import { envSchema } from "./src/env/schema";

syncNextEnv(envSchema, {
  clientFile: "src/env/client.ts",
  serverFile: "src/env/server.ts",
  schemaImportPath: "./schema",
});
```

Run this when public schema keys change so the client mapping stays explicit.

## Import Rules

Use server env only from server code:

```ts
import { env } from "@/env/server";
```

Use client env only from client-safe code:

```ts
import { env } from "@/env/client";
```

Lint integration should forbid raw `process.env` outside the env files.
