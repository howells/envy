# CLI Guide

The CLI is scaffolded but not implemented yet. This guide records the planned command surface and expected behavior.

## Config

`envy.config.ts` should be optional but recommended.

```ts
import { defineConfig } from "@envy/config";

export default defineConfig({
  schema: "./src/env/schema.ts",
  envDir: ".",
  defaultTarget: "vercel",
});
```

Every command should also accept `--schema` for monorepos and one-off checks.

```bash
envy check local --schema apps/web/src/env/schema.ts --from apps/web/.env.production
```

## Commands

### `envy check local`

Validate a local env source against the schema.

```bash
envy check local --from .env.production
envy check local --from .env.production --with-process-env
envy check local --from process
```

Default behavior should be strict about undeclared keys.

### `envy check vercel`

Check Vercel env presence for a target environment.

```bash
envy check vercel --project web --environment production
```

### `envy check railway`

Check Railway env presence for a service environment.

```bash
envy check railway --project sorrel --service web --environment production
```

### `envy push vercel`

Safely push schema-declared values to Vercel.

```bash
envy push vercel --from .env.production --environment production --dry-run
envy push vercel --from .env.production --environment production --yes
```

### `envy push railway`

Safely push schema-declared values to Railway.

```bash
envy push railway --from .env.production --service web --environment production --dry-run
envy push railway --from .env.production --service web --environment production --yes
```

### `envy init next`

Create the recommended Next.js env layout.

```bash
envy init next
```

### `envy sync next`

Regenerate explicit public env mapping.

```bash
envy sync next
```

### `envy init lint`

Create env enforcement config.

```bash
envy init lint --target oxlint
envy init lint --target biome
envy init lint --target eslint
```

## Exit Codes

Planned shape:

- `0`: success
- `1`: validation, config, missing env, or provider check failure
- `2`: command usage error

## Output Rules

CLI output should:

- show key names
- never show secret values
- make skipped, created, overwritten, and missing variables visually distinct
- include enough context to fix the problem without opening provider dashboards
