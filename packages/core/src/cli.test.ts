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

  it("returns a consistent JSON success envelope with --json", async () => {
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
          "--json",
        ],
        output.io,
      );

      expect(code).toBe(0);
      expect(JSON.parse(output.stdout)).toMatchObject({
        data: {
          keyCount: 2,
          keys: ["DATABASE_URL", "OPENAI_API_KEY"],
          mode: "server",
          sources: [".env.production"],
        },
        metadata: {
          command: "check local",
        },
        ok: true,
      });
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

      expect(code).toBe(65);
      expect(output.stdout).toBe("");
      expect(JSON.parse(output.stderr)).toMatchObject({
        error: {
          code: "ENVY_VALIDATION_FAILED",
          fields: [{ path: "DATABASE_URL" }, { path: "OPENAI_API_KEY" }],
          isRetriable: false,
          suggestions: expect.any(Array),
        },
        metadata: {
          command: "check local",
        },
        ok: false,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("recognizes validation failures from separately loaded schema modules", async () => {
    const cwd = join(process.cwd(), ".tmp-cli-foreign-error-fixture");
    await rm(cwd, { force: true, recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(
      join(cwd, "schema.mjs"),
      `
        class EnvValidationError extends Error {
          constructor() {
            super("Invalid environment variables: DATABASE_URL");
            this.name = "EnvValidationError";
            this.issues = [
              {
                group: "server",
                key: "DATABASE_URL",
                message: "Invalid input: expected string, received undefined",
                path: [],
              },
            ];
          }
        }

        function parse() {
          throw new EnvValidationError();
        }

        export const envSchema = {
          parse,
          parseClient: parse,
          parseServer: parse,
        };
      `,
    );
    const output = createOutput(cwd);

    try {
      const code = await runCli(
        ["check", "local", "--schema", "schema.mjs", "--json"],
        output.io,
      );

      expect(code).toBe(65);
      expect(output.stdout).toBe("");
      expect(JSON.parse(output.stderr)).toMatchObject({
        error: {
          code: "ENVY_VALIDATION_FAILED",
          fields: [{ path: "DATABASE_URL" }],
        },
        ok: false,
      });
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  });

  it("returns semantic usage errors for missing schema", async () => {
    const output = createOutput();
    const code = await runCli(["check", "local", "--json"], output.io);

    expect(code).toBe(64);
    expect(JSON.parse(output.stderr)).toMatchObject({
      error: {
        code: "ENVY_USAGE_ERROR",
      },
      ok: false,
    });
  });

  it("returns semantic input errors for missing env files", async () => {
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
          "missing.env",
          "--json",
        ],
        output.io,
      );

      expect(code).toBe(66);
      expect(JSON.parse(output.stderr)).toMatchObject({
        error: {
          code: "ENVY_INPUT_UNREADABLE",
        },
        ok: false,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects control characters in paths", async () => {
    const output = createOutput();
    const code = await runCli(
      ["check", "local", "--schema", "schema\u0000.mjs", "--json"],
      output.io,
    );

    expect(code).toBe(64);
    expect(JSON.parse(output.stderr)).toMatchObject({
      error: {
        code: "ENVY_USAGE_ERROR",
      },
      ok: false,
    });
  });

  it("describes command contracts for agents", async () => {
    const output = createOutput();
    const code = await runCli(["describe"], output.io);

    expect(code).toBe(0);
    expect(JSON.parse(output.stdout)).toMatchObject({
      data: {
        commands: [
          {
            name: "check local",
          },
          {
            name: "run local",
          },
        ],
        exitCodes: {
          "65": "env validation failed",
        },
      },
      ok: true,
    });
  });

  it("runs a command with validated dotenv values in the child env", async () => {
    const fixture = await createCliFixture();
    const output = createOutput(fixture.cwd);

    try {
      const code = await runCli(
        [
          "run",
          "local",
          "--schema",
          "schema.mjs",
          "--from",
          ".env.production",
          "--",
          process.execPath,
          "-e",
          "console.log(process.env.DATABASE_URL); console.error(process.env.OPENAI_API_KEY ? 'key-present' : 'key-missing')",
        ],
        output.io,
      );

      expect(code).toBe(0);
      expect(output.stdout.trim()).toBe("https://db.example.com");
      expect(output.stderr.trim()).toBe("key-present");
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not run the command when env validation fails", async () => {
    const fixture = await createCliFixture({
      envFile: "DATABASE_URL=not-a-url\n",
    });
    const output = createOutput(fixture.cwd);

    try {
      const code = await runCli(
        [
          "run",
          "local",
          "--schema",
          "schema.mjs",
          "--from",
          ".env.production",
          "--",
          process.execPath,
          "-e",
          "console.log('should-not-run')",
        ],
        output.io,
      );

      expect(code).toBe(65);
      expect(output.stdout).toBe("");
      expect(output.stderr).toContain("Envy local check failed");
      expect(output.stderr).not.toContain("should-not-run");
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
