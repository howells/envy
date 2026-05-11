# `@envy/adapter-railway`

Railway deploy adapter for Envy.

This package is scaffolded. It will check and safely push schema-declared variables for a Railway service.

Planned usage:

```ts
import { railway } from "@envy/adapter-railway";

const adapter = railway({
  project: "sorrel",
  service: "web",
  environment: "production",
});
```

See [Deploy Guide](../../../docs/deploy.md).
