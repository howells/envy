import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CliIO, CommandReport } from "./commands.js";
import type { Flags } from "./flags.js";
import {
  CliInputError,
  CliProblem,
  CliUsageError,
  createProblem,
  exitCodes,
} from "./problem.js";
import { checkModes, importEnvSchema, listSchemaKeys } from "./schema.js";

/** Verifies every schema key is registered in the Turborepo task's hashed env. */
export async function checkTurbo(
  flags: Flags,
  io: CliIO,
): Promise<CommandReport> {
  const mode = flags.oneOf("mode", checkModes);
  const task = flags.required("task");
  const turboPath = flags.required("turbo");
  const schema = await importEnvSchema(flags, io.cwd);
  const turbo = await readTurboConfig(resolve(io.cwd, turboPath));
  const keys = listSchemaKeys(schema, mode);
  const registered = getTurboRegisteredEnv(turbo, task);
  const missing = keys.filter(
    (key) => !registered.some((pattern) => matchesEnvPattern(key, pattern)),
  );

  if (missing.length > 0) {
    throw new CliProblem(
      exitCodes.data,
      createProblem({
        code: "ENVY_TURBO_ENV_MISSING",
        fields: missing.map((key) => ({
          message: `Register ${key} in globalEnv or tasks.${task}.env.`,
          path: key,
        })),
        message: `${missing.length} schema variable(s) are not registered for Turborepo task ${task}.`,
        suggestions: [
          `Add the missing key names or matching wildcard patterns to tasks.${task}.env.`,
          "Use globalEnv only for variables that should affect every task hash.",
        ],
        title: "Turborepo env registration missing",
      }),
      [
        `Envy turbo check failed: ${missing.length} variable(s) missing from ${task} env.`,
        ...missing.map((key) => `- ${key}`),
      ].join("\n"),
    );
  }

  return {
    data: { keyCount: keys.length, keys, missing, task, turbo: turboPath },
    text: `Envy turbo check passed: ${keys.length} variable(s) registered for ${task}.`,
  };
}

async function readTurboConfig(
  turboFile: string,
): Promise<Record<string, unknown>> {
  let contents: string;
  try {
    contents = await readFile(turboFile, "utf8");
  } catch {
    throw new CliInputError(`Turbo config could not be read: ${turboFile}`, [
      "Check the --turbo path and make sure the file exists.",
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new CliUsageError(
      `Turbo config could not be parsed as JSON: ${error instanceof Error ? error.message : String(error)}`,
      ["Pass a valid turbo.json file."],
    );
  }

  const config = readObject(parsed);
  if (!config) {
    throw new CliUsageError(
      "Turbo config could not be parsed as JSON: Turbo config must be a JSON object.",
      ["Pass a valid turbo.json file."],
    );
  }
  return config;
}

/**
 * Collects the env patterns that count toward a task's hash: `globalEnv`,
 * `global.env` and `tasks.<task>.env`. Negated patterns do not register a key.
 */
function getTurboRegisteredEnv(
  turbo: Record<string, unknown>,
  taskName: string,
): readonly string[] {
  const task = readObject(readObject(turbo.tasks)?.[taskName]);
  if (!task) {
    throw new CliUsageError(
      `Turbo task ${taskName} was not found in the config.`,
      ["Pass --task with an existing task name."],
    );
  }

  return [
    ...readStringArray(turbo.globalEnv),
    ...readStringArray(readObject(turbo.global)?.env),
    ...readStringArray(task.env),
  ].filter((entry) => !entry.startsWith("!"));
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function matchesEnvPattern(key: string, pattern: string): boolean {
  if (pattern === key) return true;
  if (!pattern.includes("*")) return false;

  const [prefix, ...rest] = pattern.split("*");
  const suffix = rest.join("*");
  return key.startsWith(prefix ?? "") && key.endsWith(suffix);
}
