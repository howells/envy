# `@envy/adapter-vercel`

Vercel deploy adapter for Envy.

This package is scaffolded. It will check and safely push schema-declared variables for a Vercel project.

Planned usage:

```ts
import { vercel } from "@envy/adapter-vercel";

const adapter = vercel({
  project: "web",
  environment: "production",
});
```

See [Deploy Guide](../../../docs/deploy.md).
