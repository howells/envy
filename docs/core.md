# Core API

`@howells/envy` is the implemented foundation of Envy. It defines schemas, validates input objects, and returns typed parsed values.

## Define A Schema

```ts
import { defineEnv, v } from "@howells/envy";
import { z } from "zod";

export const envSchema = defineEnv({
  server: {
    DATABASE_URL: z.string().url(),
    OPENAI_API_KEY: v(z.string().min(1), {
      deploy: ["preview", "production"],
    }),
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

Raw Zod schemas are enough for most variables. Use `v(...)` only when a variable needs metadata for tools.

## Groups

### `server`

Private values required by server-side code.

```ts
server: {
  DATABASE_URL: z.string().url(),
}
```

Missing values fail validation unless the Zod schema has a default or otherwise accepts `undefined`.

### `public`

Client-safe values.

```ts
public: {
  NEXT_PUBLIC_APP_URL: z.string().url(),
}
```

Public keys must start with the configured public prefix. The default is `NEXT_PUBLIC_`.

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

### `system`

Runtime or provider-owned values such as `NODE_ENV`, `CI`, `VERCEL_URL`, or `RAILWAY_*`.

```ts
system: {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
}
```

These values parse normally and are excluded from deploy pushes by default.

### `optional`

Optional integration values.

```ts
optional: {
  COHERE_API_KEY: z.string().min(1),
}
```

Missing and empty values parse as `undefined`. Present values must pass the Zod schema.

## Parsing Methods

### `parse(input)`

Parses all groups and returns a frozen object.

```ts
const env = envSchema.parse(process.env);
```

Use this in non-Next server contexts and scripts.

### `parseServer(input)`

Parses `server`, `public`, `system`, and `optional`.

```ts
export const env = envSchema.parseServer(process.env);
```

Use this for server-side application code.

### `parseClient(input)`

Parses only `public`.

```ts
export const env = envSchema.parseClient({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
```

Use this for client bundle entrypoints.

### `lazy(input)`

Returns a proxy that validates each declared key on access.

```ts
const env = envSchema.lazy(process.env);
```

Lazy mode is for awkward runtimes where validating everything up front is not viable. Prefer explicit parsing otherwise.

## Empty Strings

By default, Envy converts `""` to `undefined` before validation.

This makes `.env` placeholders behave sensibly:

```env
OPTIONAL_KEY=
PORT=
```

```ts
defineEnv({
  optional: {
    OPTIONAL_KEY: z.string().min(1),
  },
  system: {
    PORT: z.coerce.number().default(3000),
  },
});
```

`OPTIONAL_KEY` becomes `undefined`, and `PORT` uses its Zod default.

Disable this only when empty string is a meaningful value:

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

## Unknown Keys

Parsed output only contains schema-declared keys.

```ts
const env = envSchema.parse({
  DATABASE_URL: "https://db.example.com",
  RANDOM_EXTRA: "ignored",
});
```

`RANDOM_EXTRA` is stripped from the returned object.

CLI checks report undeclared keys in env files. Runtime parsing keeps application code focused on the declared typed surface.

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

## Public Prefix Enforcement

This fails immediately when the schema is defined:

```ts
defineEnv({
  public: {
    APP_URL: z.string().url(),
  },
});
```

Use `NEXT_PUBLIC_APP_URL` or configure a different prefix.

## Duplicate Keys

A key may be declared in only one group.

```ts
defineEnv({
  server: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  public: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
});
```

This fails during schema definition.
