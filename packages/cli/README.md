# `@envy/cli`

Command-line interface for Envy.

The installable `envy` binary ships with `@howells/envy`.

```bash
npm install @howells/envy zod
npx envy check local --schema ./src/env/schema.ts --from .env.production
```

This private workspace package delegates to the published CLI entry point while
the monorepo keeps future CLI-related packages separate.

See [CLI Guide](../../docs/cli.md).
