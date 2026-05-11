# `@envy/dotenv`

Explicit dotenv loading helpers for Envy.

This package is scaffolded. Core parsing intentionally accepts plain objects and does not read files. Dotenv support lives here so file loading stays opt-in.

Planned usage:

```ts
import { loadDotenv } from "@envy/dotenv";

loadDotenv([".env.local", ".env"]);
```

See [Core API](../../docs/core.md).
