# Testing Guide

Envy keeps env tests local. Importing the schema does not read or validate `process.env`.

## Test With Plain Objects

Prefer direct object input in unit tests:

```ts
import { describe, expect, it } from "vitest";
import { envSchema } from "../src/env/schema";

describe("env", () => {
  it("parses test values", () => {
    const env = envSchema.parseServer({
      DATABASE_URL: "https://db.example.com",
      OPENAI_API_KEY: "test-key",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    });

    expect(env.OPENAI_API_KEY).toBe("test-key");
  });
});
```

This avoids import-order problems and shared global state.

## Avoid Hidden `NODE_ENV=test` Behavior

Normal parsing does not weaken validation because `NODE_ENV` is `test`.

If a test needs fewer values, pass those values through a schema that allows them.

## Mutable Test State

Use `@envy/test` when a suite needs controlled override/reset behavior:

```ts
import { createEnvStore } from "@envy/test";
import { envSchema } from "../src/env/schema";

const store = createEnvStore(envSchema, {
  DATABASE_URL: "https://db.example.com",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
});

store.override({ OPENAI_API_KEY: "test-key" });

const env = envSchema.parseServer(store.values());

store.reset();
```

The store does not mutate `process.env`.

## Lazy Mode In Tests

Use `lazy()` for code paths where not every declared value is needed:

```ts
const env = envSchema.lazy({
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
});

expect(env.NEXT_PUBLIC_APP_URL).toBe("https://app.example.com");
```

Accessing a missing required key still throws.

## What To Test

Project env tests usually cover:

- every required key can parse from a realistic fixture
- optional keys are `undefined` when absent
- public client parsing exposes only public keys
- server parsing exposes server and public keys
- defaults behave as expected
- invalid values fail with useful errors

## What Not To Test

Do not test Zod itself. For example, you do not need exhaustive tests for `z.string().url()`. Test that your schema wires the expected keys and defaults into Envy.
