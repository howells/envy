# `@envy/test`

Test helpers for Envy.

This package contains `createEnvStore`, a small mutable store for tests that need controlled override/reset behavior without mutating global `process.env`.

```ts
import { createEnvStore } from "@envy/test";

const store = createEnvStore(envSchema, {
  DATABASE_URL: "https://db.example.com",
});

store.override({ OPENAI_API_KEY: "test-key" });
store.reset();
```

See [Testing Guide](../../docs/testing.md).
