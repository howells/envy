import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDotenv, runCli } from "./cli.js";

describe("parseDotenv", () => {
  it("parses common dotenv syntax without adding newlines", () => {
    expect(
      parseDotenv(`
        # ignored
        DATABASE_URL=https://db.example.com
        export OPENAI_API_KEY="sk-test"
        SINGLE_QUOTED='plain value'
        EMPTY=
        INLINE_COMMENT=value # comment
      `),
    ).toEqual({
      DATABASE_URL: "https://db.example.com",
      EMPTY: "",
      INLINE_COMMENT: "value",
      OPENAI_API_KEY: "sk-test",
      SINGLE_QUOTED: "plain value",
    });
  });
});

describe("runCli", () => {
  it("shows help", async () => {
    const output = createOutput();
    const code = await runCli(["--help"], output.io);

    expect(code).toBe(0);
    expect(output.stdout).toContain("envy");
    expect(output.stdout).toContain("check local");
  });

  it("checks a dotenv file against an imported schema", async () => {
    const fixture = await createCliFixture();
    const output = createOutput(fixture.cwd);

    try {
      const code = await runCli(
        [
          "check",
          "local",
          "--schema",
          "schema.mjs",
          "--from",
          ".env.production",
        ],
        output.io,
      );

      expect(code).toBe(0);
      expect(output.stdout).toContain("Envy local check passed");
      expect(output.stderr).toBe("");
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns structured validation failures", async () => {
    const fixture = await createCliFixture({
      envFile: "DATABASE_URL=not-a-url\n",
    });
    const output = createOutput(fixture.cwd);

    try {
      const code = await runCli(
        [
          "check",
          "local",
          "--schema",
          "schema.mjs",
          "--from",
          ".env.production",
          "--format",
          "json",
        ],
        output.io,
      );

      expect(code).toBe(1);
      expect(JSON.parse(output.stdout)).toMatchObject({
        issues: [
          { group: "server", key: "DATABASE_URL" },
          { group: "server", key: "OPENAI_API_KEY" },
        ],
        ok: false,
      });
    } finally {
      await fixture.cleanup();
    }
  });
});

function createOutput(cwd = process.cwd()): {
  io: Parameters<typeof runCli>[1];
  readonly stderr: string;
  readonly stdout: string;
} {
  let stderr = "";
  let stdout = "";

  return {
    get stderr() {
      return stderr;
    },
    get stdout() {
      return stdout;
    },
    io: {
      cwd,
      env: {},
      stderr: {
        write(chunk: string) {
          stderr += chunk;
          return true;
        },
      },
      stdout: {
        write(chunk: string) {
          stdout += chunk;
          return true;
        },
      },
    },
  };
}

async function createCliFixture(
  options: { envFile?: string } = {},
): Promise<{ cleanup(): Promise<void>; cwd: string }> {
  const cwd = join(process.cwd(), ".tmp-cli-fixture");
  await rm(cwd, { force: true, recursive: true });
  await mkdir(cwd, { recursive: true });
  await writeFile(
    join(cwd, "schema.mjs"),
    `
      import { z } from "zod";
      import { defineEnv } from "../src/index.ts";

      export const envSchema = defineEnv({
        server: {
          DATABASE_URL: z.string().url(),
          OPENAI_API_KEY: z.string().min(1),
        },
      });
    `,
  );
  await writeFile(
    join(cwd, ".env.production"),
    options.envFile ??
      "DATABASE_URL=https://db.example.com\nOPENAI_API_KEY=sk-test\n",
  );

  return {
    cleanup() {
      return rm(cwd, { force: true, recursive: true });
    },
    cwd,
  };
}
