import { defineConfig } from "tsup";

// Entry points import modules that are not entry points themselves, which the
// declaration build rejects while the tsconfig's `composite` is on.
const dts = { compilerOptions: { composite: false } };

export default defineConfig([
  {
    dts,
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
    // The CLI uses top-level await, so it ships as ESM only.
    dts,
    entry: ["src/cli.ts"],
    format: ["esm"],
    sourcemap: true,
  },
]);
