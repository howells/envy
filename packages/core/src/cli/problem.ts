import { EnvValidationError } from "../index.js";

export type ExitCode = 0 | 64 | 65 | 66 | 70;

export const exitCodes = {
  data: 65,
  input: 66,
  ok: 0,
  software: 70,
  usage: 64,
} as const satisfies Record<string, ExitCode>;

export interface ProblemDetails {
  readonly code: string;
  readonly detail?: string;
  readonly docUri: string;
  readonly fields?: readonly {
    readonly message: string;
    readonly path: string;
  }[];
  readonly isRetriable: boolean;
  readonly message: string;
  readonly suggestions: readonly string[];
  readonly title: string;
  readonly type: string;
}

export function createProblem(input: {
  readonly code: string;
  readonly detail?: string;
  readonly fields?: ProblemDetails["fields"];
  readonly message: string;
  readonly suggestions?: readonly string[];
  readonly title: string;
}): ProblemDetails {
  return {
    code: input.code,
    detail: input.detail,
    docUri: "https://github.com/howells/envy#cli",
    fields: input.fields,
    isRetriable: false,
    message: input.message,
    suggestions: input.suggestions ?? [],
    title: input.title,
    type: `https://github.com/howells/envy/errors/${input.code.toLowerCase()}`,
  };
}

export function formatTextError(problem: ProblemDetails): string {
  const suggestions =
    problem.suggestions.length > 0
      ? `\n${problem.suggestions.map((suggestion) => `- ${suggestion}`).join("\n")}`
      : "";
  return `${problem.title}: ${problem.message}${suggestions}`;
}

/**
 * A failure the CLI knows how to report: an exit code, the JSON problem, and
 * the text shown when the output format is text.
 */
export class CliProblem extends Error {
  readonly exitCode: ExitCode;
  readonly problem: ProblemDetails;
  readonly text: string;

  constructor(
    exitCode: ExitCode,
    problem: ProblemDetails,
    text = formatTextError(problem),
  ) {
    super(problem.message);
    this.name = "CliProblem";
    this.exitCode = exitCode;
    this.problem = problem;
    this.text = text;
  }
}

export class CliUsageError extends CliProblem {
  constructor(message: string, suggestions: readonly string[] = []) {
    super(
      exitCodes.usage,
      createProblem({
        code: "ENVY_USAGE_ERROR",
        message,
        suggestions,
        title: "Usage error",
      }),
    );
  }
}

export class CliInputError extends CliProblem {
  constructor(message: string, suggestions: readonly string[] = []) {
    super(
      exitCodes.input,
      createProblem({
        code: "ENVY_INPUT_UNREADABLE",
        message,
        suggestions,
        title: "Input unreadable",
      }),
    );
  }
}

/**
 * Turns anything a command threw into a reportable problem. Env validation
 * failures exit 65; anything unrecognised is an internal error.
 */
export function toCliProblem(error: unknown): CliProblem {
  if (error instanceof CliProblem) return error;

  if (isEnvValidationError(error)) {
    return new CliProblem(
      exitCodes.data,
      createProblem({
        code: "ENVY_VALIDATION_FAILED",
        detail: JSON.stringify(error.issues),
        fields: error.issues.map((issue) => ({
          message: issue.message,
          path:
            issue.path.length > 0
              ? `${issue.key}.${issue.path.join(".")}`
              : issue.key,
        })),
        message: `Environment validation failed with ${error.issues.length} issue(s).`,
        suggestions: [
          "Set every required schema variable in the checked env source.",
          "Use `--mode client` when validating only public client variables.",
        ],
        title: "Environment validation failed",
      }),
      [
        `Envy local check failed with ${error.issues.length} issue(s).`,
        ...error.issues.map(
          (issue) => `- ${issue.key} [${issue.group}]: ${issue.message}`,
        ),
      ].join("\n"),
    );
  }

  return new CliProblem(
    exitCodes.software,
    createProblem({
      code: "ENVY_INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
      suggestions: [
        "Re-run with the same inputs. If it persists, open an issue.",
      ],
      title: "Internal error",
    }),
  );
}

/**
 * The schema module under check may load its own copy of this package, so a
 * validation error is recognised by shape as well as by class.
 */
function isEnvValidationError(error: unknown): error is EnvValidationError {
  return (
    error instanceof EnvValidationError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "EnvValidationError" &&
      "issues" in error &&
      Array.isArray(error.issues))
  );
}
