# `@envy/config`

Typed config helper for `envy.config.ts`.

This package is scaffolded and exports `defineConfig`.

```ts
import { defineConfig } from "@envy/config";

export default defineConfig({
  schema: "./src/env/schema.ts",
  envDir: ".",
  defaultTarget: "vercel",
});
```

See [CLI Guide](../../docs/cli.md).
