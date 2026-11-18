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

  it("fails when schema keys are missing from a turbo task env", async () => {
    const fixture = await createCliFixture({
      turboJson: JSON.stringify({
        tasks: {
          build: {
            env: ["DATABASE_URL"],
          },
        },
      }),
    });
    const output = createOutput(fixture.cwd);

    try {
      const code = await runCli(
        [
          "check",
          "turbo",
          "--schema",
          "schema.mjs",
          "--turbo",
          "turbo.json",
          "--task",
          "build",
          "--json",
        ],
        output.io,
      );

      expect(code).toBe(65);
      expect(output.stdout).toBe("");
      expect(JSON.parse(output.stderr)).toMatchObject({
        error: {
          code: "ENVY_TURBO_ENV_MISSING",
          fields: [{ path: "OPENAI_API_KEY" }],
        },
        metadata: {
          command: "check turbo",
        },
        ok: false,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("accepts exact global env and wildcard task env registrations", async () => {
    const fixture = await createCliFixture({
      schema: `
        import { z } from "zod";
        import { defineEnv } from "../src/index.ts";

        export const envSchema = defineEnv({
          server: {
            DATABASE_URL: z.string().url(),
            OPENAI_API_KEY: z.string().min(1),
          },
          public: {
            NEXT_PUBLIC_APP_URL: z.string().url(),
          },
        });
      `,
      turboJson: JSON.stringify({
        globalEnv: ["OPENAI_API_KEY"],
        tasks: {
          build: {
            env: ["DATABASE_URL", "NEXT_PUBLIC_*"],
          },
        },
      }),
    });
    const output = createOutput(fixture.cwd);

    try {
      const code = await runCli(
        [
          "check",
          "turbo",
          "--schema",
          "schema.mjs",
          "--turbo",
          "turbo.json",
          "--task",
          "build",
          "--json",
        ],
        output.io,
      );

      expect(code).toBe(0);
      expect(JSON.parse(output.stdout)).toMatchObject({
        data: {
          keyCount: 3,
          keys: ["DATABASE_URL", "NEXT_PUBLIC_APP_URL", "OPENAI_API_KEY"],
          missing: [],
          task: "build",
          turbo: "turbo.json",
        },
        metadata: {
          command: "check turbo",
        },
        ok: true,
      });
      expect(output.stderr).toBe("");
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
            name: "check turbo",
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

  it.each([
    [["check", "local", "--schema", "schema.mjs", "--nope"]],
    [["check", "local", "--schema", "schema.mjs", "--mode", "nope"]],
    [["check", "local", "--schema", "schema.mjs", "--format", "nope"]],
    [["check", "local", "--schema"]],
    [["check", "turbo", "--schema", "schema.mjs", "--nope"]],
    [["check", "turbo"]],
    [["run", "local", "--schema", "schema.mjs"]],
    [["run", "local", "--schema", "schema.mjs", "--"]],
    [["run", "local", "--schema", "schema.mjs", "--nope", "--", "node"]],
    [["run", "local", "--schema", "schema.mjs", "--json", "--", "node"]],
  ])("exits 64 with a text usage error for %j", async (argv) => {
    const output = createOutput();
    const code = await runCli(argv, output.io);

    expect(code).toBe(64);
    expect(output.stdout).toBe("");
    expect(output.stderr).toContain("sage error");
  });

  it("exits 64 with help on stderr for an unknown command", async () => {
    const output = createOutput();
    const code = await runCli(["nope"], output.io);

    expect(code).toBe(64);
    expect(output.stdout).toBe("");
    expect(output.stderr).toContain("Usage error: Unknown command: nope");
    expect(output.stderr).toContain("Usage:");
  });

  it.each([
    [["check", "local", "--help"]],
    [["check", "turbo", "-h"]],
    [["run", "local", "--help"]],
  ])("prints help and exits 0 for %j", async (argv) => {
    const output = createOutput();
    const code = await runCli(argv, output.io);

    expect(code).toBe(0);
    expect(output.stdout).toContain("Usage:");
    expect(output.stderr).toBe("");
  });

  it("leaves --help after the separator to the child command", async () => {
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
          "console.log(process.argv.at(-1))",
          "--",
          "--help",
        ],
        output.io,
      );

      expect(code).toBe(0);
      expect(output.stdout.trim()).toBe("--help");
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports the package version in describe output", async () => {
    const output = createOutput();
    await runCli(["describe"], output.io);
    const version = createOutput();
    await runCli(["--version"], version.io);

    expect(JSON.parse(output.stdout).data.version).toBe(version.stdout.trim());
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("lists missing turbo keys in text output", async () => {
    const fixture = await createCliFixture({
      turboJson: JSON.stringify({
        tasks: { build: { env: ["DATABASE_URL"] } },
      }),
    });
    const output = createOutput(fixture.cwd);

    try {
      const code = await runCli(
        ["check", "turbo", "--schema", "schema.mjs"],
        output.io,
      );

      expect(code).toBe(65);
      expect(output.stdout).toBe("");
      expect(output.stderr).toBe(
        "Envy turbo check failed: 1 variable(s) missing from build env.\n- OPENAI_API_KEY\n",
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("exits 64 when the turbo task does not exist", async () => {
    const fixture = await createCliFixture({
      turboJson: JSON.stringify({ tasks: {} }),
    });
    const output = createOutput(fixture.cwd);

    try {
      const code = await runCli(
        ["check", "turbo", "--schema", "schema.mjs", "--json"],
        output.io,
      );

      expect(code).toBe(64);
      expect(JSON.parse(output.stderr)).toMatchObject({
        error: { code: "ENVY_USAGE_ERROR" },
        metadata: { command: "check turbo" },
        ok: false,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("lists validation issues in text output without values", async () => {
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
        ],
        output.io,
      );

      expect(code).toBe(65);
      expect(output.stderr).toContain(
        "Envy local check failed with 2 issue(s).\n- DATABASE_URL [server]: ",
      );
      expect(output.stderr).not.toContain("not-a-url");
    } finally {
      await fixture.cleanup();
    }
  });

  it("describes check local without a schema", async () => {
    const output = createOutput();
    const code = await runCli(["check", "local", "--describe"], output.io);

    expect(code).toBe(0);
    expect(JSON.parse(output.stdout)).toMatchObject({
      data: { name: "envy" },
      metadata: { command: "check local --describe" },
      ok: true,
    });
  });

  it("exits 66 when the command cannot be started", async () => {
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
          "envy-no-such-executable",
        ],
        output.io,
      );

      expect(code).toBe(66);
      expect(output.stderr).toContain("Command could not be started");
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
  options: { envFile?: string; schema?: string; turboJson?: string } = {},
): Promise<{ cleanup(): Promise<void>; cwd: string }> {
  const cwd = join(process.cwd(), ".tmp-cli-fixture");
  await rm(cwd, { force: true, recursive: true });
  await mkdir(cwd, { recursive: true });
  await writeFile(
    join(cwd, "schema.mjs"),
    options.schema ??
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
  if (options.turboJson) {
    await writeFile(join(cwd, "turbo.json"), options.turboJson);
  }

  return {
    cleanup() {
      return rm(cwd, { force: true, recursive: true });
    },
    cwd,
  };
}
