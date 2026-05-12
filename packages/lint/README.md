# `@envy/lint`

Lint integration helpers for Envy.

This package exposes lint config helpers for Oxlint, ESLint, and Biome companion config.

```ts
import { createOxlintConfig } from "@envy/lint";

const config = createOxlintConfig({
  allowedVariables: ["NODE_ENV", "CI"],
});
```

See [Lint Guide](../../docs/lint.md).
