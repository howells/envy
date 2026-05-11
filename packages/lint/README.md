# `@envy/lint`

Lint integration helpers for Envy.

This package is scaffolded. It currently exposes `createOxlintConfig`, which generates the preferred initial enforcement config around Oxlint's native `node/no-process-env` rule.

```ts
import { createOxlintConfig } from "@envy/lint";

const config = createOxlintConfig({
  allowedVariables: ["NODE_ENV", "CI"],
});
```

See [Lint Guide](../../docs/lint.md).
