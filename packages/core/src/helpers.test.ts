import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadDotenv, parseDotenvFile } from "./dotenv.js";
import { defineEnv, listDeployEnvVars, listEnvVars, v } from "./index.js";
import { createLintIntegration, createOxlintConfig } from "./lint.js";
import { generateNextEnvFiles, syncNextEnv } from "./next.js";

describe("schema metadata helpers", () => {
  it("lists schema-declared variables without exposing schemas", () => {
    const envSchema = defineEnv({
      optional: {
        SENTRY_DSN: v.optional(z.string().url(), { deploy: ["production"] }),
      },
      public: {
        NEXT_PUBLIC_APP_URL: z.string().url(),
      },
      server: {
        DATABASE_URL: z.string().url(),
      },
      system: {
        NODE_ENV: z.string().default("development"),
      },
    });

    expect(listEnvVars(envSchema).map((entry) => entry.key)).toEqual([
      "DATABASE_URL",
      "NEXT_PUBLIC_APP_URL",
      "NODE_ENV",
      "SENTRY_DSN",
    ]);
    expect(
      listDeployEnvVars(envSchema, { environment: "production" }).map(
        (entry) => entry.key,
      ),
    ).toEqual(["DATABASE_URL", "NEXT_PUBLIC_APP_URL", "SENTRY_DSN"]);
    expect(
      listDeployEnvVars(envSchema, { environment: "preview" }).map(
        (entry) => entry.key,
      ),
    ).toEqual(["DATABASE_URL", "NEXT_PUBLIC_APP_URL"]);
  });
});

describe("dotenv helpers", () => {
  it("parses and loads dotenv files without overwriting process values by default", async () => {
    const cwd = join(process.cwd(), ".tmp-envy-dotenv");
    const target: Record<string, string | undefined> = {
      DATABASE_URL: "https://process.example.com",
    };

    await rm(cwd, { force: true, recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(
      join(cwd, ".env"),
      "DATABASE_URL=https://file.example.com\nOPENAI_API_KEY=sk-test\n",
    );

    try {
      expect(parseDotenvFile(".env", { cwd })).toEqual({
        DATABASE_URL: "https://file.example.com",
        OPENAI_API_KEY: "sk-test",
      });

      expect(loadDotenv([".env"], { cwd, processEnv: target })).toEqual({
        loaded: [join(cwd, ".env")],
        written: ["OPENAI_API_KEY"],
      });
      expect(target).toEqual({
        DATABASE_URL: "https://process.example.com",
        OPENAI_API_KEY: "sk-test",
      });
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });
});

describe("Next helpers", () => {
  it("generates explicit client mappings for public env keys", async () => {
    const cwd = join(process.cwd(), ".tmp-envy-next");
    const envSchema = defineEnv({
      public: {
        NEXT_PUBLIC_APP_URL: z.string().url(),
      },
      server: {
        DATABASE_URL: z.string().url(),
      },
    });

    await rm(cwd, { force: true, recursive: true });

    try {
      expect(generateNextEnvFiles(envSchema).client).toContain(
        "NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL",
      );

      syncNextEnv(envSchema, {
        clientFile: join(cwd, "client.ts"),
        schemaImportPath: "./schema",
        serverFile: join(cwd, "server.ts"),
      });

      await expect(readFile(join(cwd, "client.ts"), "utf8")).resolves.toContain(
        "parseClient",
      );
      await expect(readFile(join(cwd, "server.ts"), "utf8")).resolves.toContain(
        "parseServer(process.env)",
      );
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });
});

describe("lint helpers", () => {
  it("creates oxlint and eslint integration config without throwing", () => {
    expect(
      createOxlintConfig({
        allowedVariables: ["NODE_ENV"],
        envFiles: ["src/env/server.ts"],
      }),
    ).toMatchObject({
      plugins: ["node"],
      rules: {
        "node/no-process-env": [
          "error",
          {
            allowedVariables: ["NODE_ENV"],
          },
        ],
      },
    });

    expect(createLintIntegration("eslint")).toEqual(expect.any(Array));
    expect(createLintIntegration("biome")).toMatchObject({
      files: {
        includes: [],
      },
    });
  });
});
