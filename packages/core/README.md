# `@envy/core`

Core Zod-powered env parsing for Envy.

This package is implemented and tested. It owns:

- `defineEnv`
- grouped schema parsing
- `parse`, `parseServer`, `parseClient`, and `lazy`
- public prefix enforcement
- optional variable semantics
- structured validation errors
- metadata wrappers through `v(...)`

## Example

```ts
import { defineEnv } from "@envy/core";
import { z } from "zod";

export const envSchema = defineEnv({
  server: {
    DATABASE_URL: z.string().url(),
  },
  public: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
});

export const env = envSchema.parseServer(process.env);
```

See [Core API](../../docs/core.md).
