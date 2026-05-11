# Lint Guide

Typed env only works if application code actually uses it. Envy's lint story is designed to enforce this:

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

Oxlint has a native `node/no-process-env` rule. Envy should use that first before inventing a custom linter.

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

The scaffolded `@envy/lint` package already exposes `createOxlintConfig()`.

## Biome

Biome can remain the formatter and general linter. Envy can provide a simpler Biome companion integration later, but Biome's current plugin model is less expressive for schema-aware env rules.

The expected setup for projects that use Biome today is:

```bash
biome check .
oxlint .
```

or a wrapper command from a shared lint package.

## ESLint

ESLint remains useful for teams that already have ESLint or need more precise custom behavior than native Oxlint provides.

The long-term goal is to share rule semantics across:

- Oxlint native config for the common path
- ESLint plugin for precise rule behavior
- Biome plugin for basic pattern diagnostics

## Allowances

Direct `process.env` should be allowed in:

- env definition files
- generated Next client env mapping
- narrow system keys such as `NODE_ENV` and `CI`
- migration escape hatches with an inline reason

Every other direct env read should move through the typed env module.
