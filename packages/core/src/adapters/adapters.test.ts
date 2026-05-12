import { describe, expect, it } from "vitest";
import { railway } from "./railway.js";
import { vercel } from "./vercel.js";

describe("vercel adapter", () => {
  it("checks and pushes missing variables through the API", async () => {
    const calls: {
      readonly body?: unknown;
      readonly method?: string;
      readonly url: string;
    }[] = [];
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        body: init?.body,
        method: init?.method,
        url: String(input),
      });

      if (init?.method === "POST") {
        return jsonResponse({});
      }

      return jsonResponse({
        envs: [{ key: "DATABASE_URL", target: ["production"] }],
      });
    };
    const adapter = vercel({
      fetch: fetch as typeof globalThis.fetch,
      project: "web",
      token: "token",
    });

    await expect(
      adapter.check({
        environment: "production",
        keys: ["DATABASE_URL", "OPENAI_API_KEY"],
      }),
    ).resolves.toEqual({
      missing: ["OPENAI_API_KEY"],
      present: ["DATABASE_URL"],
    });
    await expect(
      adapter.push({
        environment: "production",
        values: {
          DATABASE_URL: "https://db.example.com",
          OPENAI_API_KEY: "sk-test",
        },
      }),
    ).resolves.toEqual({
      created: ["OPENAI_API_KEY"],
      dryRun: false,
      skipped: ["DATABASE_URL"],
    });
    expect(calls.some((call) => call.method === "POST")).toBe(true);
  });
});

describe("railway adapter", () => {
  it("checks and pushes variables through GraphQL", async () => {
    const calls: unknown[] = [];
    const fetch = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);

      if (body.query.includes("variableUpsert")) {
        return jsonResponse({ data: { variableUpsert: true } });
      }

      return jsonResponse({
        data: {
          variables: {
            DATABASE_URL: "redacted",
          },
        },
      });
    };
    const adapter = railway({
      environmentId: "env",
      fetch: fetch as typeof globalThis.fetch,
      projectId: "project",
      serviceId: "service",
      token: "token",
    });

    await expect(
      adapter.check({ keys: ["DATABASE_URL", "OPENAI_API_KEY"] }),
    ).resolves.toEqual({
      missing: ["OPENAI_API_KEY"],
      present: ["DATABASE_URL"],
    });
    await expect(
      adapter.push({
        values: {
          DATABASE_URL: "https://db.example.com",
          OPENAI_API_KEY: "sk-test",
        },
      }),
    ).resolves.toEqual({
      dryRun: false,
      skipped: ["DATABASE_URL"],
      written: ["OPENAI_API_KEY"],
    });
    expect(calls).toHaveLength(3);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
    statusText: "OK",
  });
}
