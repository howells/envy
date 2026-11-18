import { defineConfig } from "tsup";

export default defineConfig([
  {
    dts: true,
    entry: [
      "src/index.ts",
      "src/dotenv.ts",
      "src/next.ts",
      "src/lint.ts",
      "src/adapters/vercel.ts",
      "src/adapters/railway.ts",
    ],
    format: ["esm", "cjs"],
    sourcemap: true,
  },
  {
    // The CLI uses top-level await, so it ships as ESM only. Its modules are
    // not entry points, which the declaration build rejects under `composite`.
    dts: { compilerOptions: { composite: false } },
    entry: ["src/cli.ts"],
    format: ["esm"],
    sourcemap: true,
  },
]);
