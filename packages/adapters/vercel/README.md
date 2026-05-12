# `@envy/adapter-vercel`

Vercel deploy adapter for Envy.

This package checks and safely pushes schema-declared variables for a Vercel project.

Usage:

```ts
import { vercel } from "@envy/adapter-vercel";

const adapter = vercel({
  project: "web",
});

await adapter.check({
  environment: "production",
  keys: ["DATABASE_URL"],
});
```

See [Deploy Guide](../../../docs/deploy.md).
