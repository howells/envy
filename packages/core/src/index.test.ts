import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineEnv, EnvValidationError, v } from "./index.js";

describe("defineEnv", () => {
  it("parses grouped env values, strips unknown keys, and freezes parsed output", () => {
    const envSchema = defineEnv({
      server: {
        DATABASE_URL: z.string().url(),
      },
      public: {
        NEXT_PUBLIC_APP_URL: z.string().url(),
      },
      optional: {
        COHERE_API_KEY: z.string().min(1),
      },
    });

    const parsed = envSchema.parse({
      DATABASE_URL: "https://db.example.com",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
      RANDOM_EXTRA: "ignored",
    });

    expect(parsed).toEqual({
      COHERE_API_KEY: undefined,
      DATABASE_URL: "https://db.example.com",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    });
    expect("RANDOM_EXTRA" in parsed).toBe(false);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("throws a structured validation error when required variables are missing", () => {
    const envSchema = defineEnv({
      server: {
        DATABASE_URL: z.string().url(),
        OPENAI_API_KEY: z.string().min(1),
      },
    });

    expect(() => envSchema.parse({})).toThrow(EnvValidationError);

    try {
      envSchema.parse({});
      throw new Error("Expected parse to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ group: "server", key: "DATABASE_URL" }),
          expect.objectContaining({ group: "server", key: "OPENAI_API_KEY" }),
        ]),
      );
    }
  });

  it("treats empty strings as undefined by default", () => {
    const envSchema = defineEnv({
      optional: {
        COHERE_API_KEY: z.string().min(1),
      },
      system: {
        PORT: z.coerce.number().default(3000),
      },
    });

    const parsed = envSchema.parse({
      COHERE_API_KEY: "",
      PORT: "",
    });

    expect(parsed).toEqual({
      COHERE_API_KEY: undefined,
      PORT: 3000,
    });
  });

  it("can preserve empty strings when emptyStringAsUndefined is disabled", () => {
    const envSchema = defineEnv(
      {
        server: {
          EMPTY_ALLOWED: z.literal(""),
        },
      },
      {
        emptyStringAsUndefined: false,
      },
    );

    expect(envSchema.parse({ EMPTY_ALLOWED: "" })).toEqual({
      EMPTY_ALLOWED: "",
    });
  });

  it("validates optional values when they are present", () => {
    const envSchema = defineEnv({
      optional: {
        COHERE_API_KEY: z.string().min(8),
      },
    });

    expect(envSchema.parse({})).toEqual({
      COHERE_API_KEY: undefined,
    });
    expect(() => envSchema.parse({ COHERE_API_KEY: "short" })).toThrow(
      EnvValidationError,
    );
    expect(envSchema.parse({ COHERE_API_KEY: "long-enough" })).toEqual({
      COHERE_API_KEY: "long-enough",
    });
  });

  it("applies Zod defaults in required groups when a value is absent", () => {
    const envSchema = defineEnv({
      system: {
        NODE_ENV: z
          .enum(["development", "test", "production"])
          .default("development"),
      },
    });

    expect(envSchema.parse({})).toEqual({
      NODE_ENV: "development",
    });
  });

  it("enforces the default Next.js public prefix", () => {
    expect(() =>
      defineEnv({
        public: {
          APP_URL: z.string().url(),
        },
      }),
    ).toThrow("Public env var APP_URL must start with NEXT_PUBLIC_.");
  });

  it("allows a custom public prefix", () => {
    const envSchema = defineEnv(
      {
        public: {
          PUBLIC_APP_URL: z.string().url(),
        },
      },
      {
        publicPrefix: "PUBLIC_",
      },
    );

    expect(
      envSchema.parseClient({ PUBLIC_APP_URL: "https://app.example.com" }),
    ).toEqual({
      PUBLIC_APP_URL: "https://app.example.com",
    });
  });

  it("rejects duplicate keys across groups", () => {
    expect(() =>
      defineEnv({
        public: {
          NEXT_PUBLIC_APP_URL: z.string().url(),
        },
        server: {
          NEXT_PUBLIC_APP_URL: z.string().url(),
        },
      }),
    ).toThrow(
      "Environment variable NEXT_PUBLIC_APP_URL is declared in both server and public.",
    );
  });

  it("parseClient returns public keys only and does not require server keys", () => {
    const envSchema = defineEnv({
      server: {
        DATABASE_URL: z.string().url(),
      },
      public: {
        NEXT_PUBLIC_APP_URL: z.string().url(),
      },
      system: {
        NODE_ENV: z
          .enum(["development", "test", "production"])
          .default("development"),
      },
      optional: {
        COHERE_API_KEY: z.string().min(1),
      },
    });

    expect(
      envSchema.parseClient({ NEXT_PUBLIC_APP_URL: "https://app.example.com" }),
    ).toEqual({
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    });
  });

  it("parseServer includes server, public, system, and optional keys", () => {
    const envSchema = defineEnv({
      server: {
        DATABASE_URL: z.string().url(),
      },
      public: {
        NEXT_PUBLIC_APP_URL: z.string().url(),
      },
      system: {
        NODE_ENV: z.enum(["development", "test", "production"]).default("test"),
      },
      optional: {
        COHERE_API_KEY: z.string().min(1),
      },
    });

    expect(
      envSchema.parseServer({
        DATABASE_URL: "https://db.example.com",
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
      }),
    ).toEqual({
      COHERE_API_KEY: undefined,
      DATABASE_URL: "https://db.example.com",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
      NODE_ENV: "test",
    });
  });

  it("supports v(...) metadata wrappers without changing parse behavior", () => {
    const envSchema = defineEnv({
      server: {
        OPENAI_API_KEY: v(z.string().min(1), {
          deploy: ["preview", "production"],
        }),
      },
    });

    expect(envSchema.parse({ OPENAI_API_KEY: "sk-test" })).toEqual({
      OPENAI_API_KEY: "sk-test",
    });
  });
});

describe("EnvSchema.lazy", () => {
  it("does not validate until a key is accessed", () => {
    const envSchema = defineEnv({
      server: {
        DATABASE_URL: z.string().url(),
      },
      public: {
        NEXT_PUBLIC_APP_URL: z.string().url(),
      },
    });

    const env = envSchema.lazy({
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    });

    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://app.example.com");
    expect(() => env.DATABASE_URL).toThrow(EnvValidationError);
  });

  it("returns undefined for unknown keys", () => {
    const envSchema = defineEnv({
      server: {
        DATABASE_URL: z.string().url(),
      },
    });

    const env = envSchema.lazy({
      DATABASE_URL: "https://db.example.com",
    });

    expect((env as Record<string, unknown>).NOT_DECLARED).toBeUndefined();
  });

  it("caches parsed values after first access", () => {
    const envSchema = defineEnv({
      server: {
        DATABASE_URL: z.string().url(),
      },
    });
    const input = {
      DATABASE_URL: "https://db.example.com",
    };
    const env = envSchema.lazy(input);

    expect(env.DATABASE_URL).toBe("https://db.example.com");
    input.DATABASE_URL = "not-a-url";
    expect(env.DATABASE_URL).toBe("https://db.example.com");
  });
});
