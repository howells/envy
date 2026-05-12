# `@envy/adapter-railway`

Railway deploy adapter for Envy.

This package checks and safely pushes schema-declared variables for a Railway service.

Usage:

```ts
import { railway } from "@envy/adapter-railway";

const adapter = railway({
  environmentId: "environment_id",
  projectId: "project_id",
  serviceId: "service_id",
});

await adapter.check({
  keys: ["DATABASE_URL"],
});
```

See [Deploy Guide](../../../docs/deploy.md).
