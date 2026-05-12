# Lint Guide

Typed env only works if application code uses the typed module:

```ts
// Prefer this
import { env } from "@/env/server";

const url = env.DATABASE_URL;
```

```ts
// Avoid this
const url = process.env.DATABASE_URL;
```

## Preferred V1 Path: Oxlint

Oxlint has a native `node/no-process-env` rule. Envy uses that instead of maintaining a custom parser for the common case.

```jsonc
{
  "plugins": ["node"],
  "rules": {
    "node/no-process-env": [
      "error",
      {
        "allowedVariables": ["NODE_ENV", "CI"]
      }
    ]
  }
}
```

`@howells/envy/lint` exposes `createOxlintConfig()` and `createLintIntegration()`.

## Biome

Biome can remain the formatter and general linter. Envy provides a small Biome companion config for generated env files. Direct `process.env` enforcement runs through Oxlint or ESLint.

The expected setup for projects that use Biome today is:

```bash
biome check .
oxlint .
```

or a wrapper command from a shared lint package.

## ESLint

ESLint remains useful for teams that already have ESLint or need more precise custom behavior than native Oxlint provides.

The lint helpers cover:

- Oxlint native config for the common path
- ESLint plugin for precise rule behavior
- Biome plugin for basic pattern diagnostics

## Allowances

Direct `process.env` belongs in:

- env definition files
- generated Next client env mapping
- narrow system keys such as `NODE_ENV` and `CI`
- migration escape hatches with an inline reason

Every other env read goes through the typed env module.
