/**
 * Public command metadata for the `envy` binary.
 *
 * The executable is still a scaffold, but this registry gives docs and tests a
 * single source of truth for the command surface Envy intends to support.
 *
 * @module
 */

/**
 * Describes a command exposed by the `envy` binary.
 *
 * Command objects intentionally contain metadata only. Actual command handlers
 * should live separately so help output can stay cheap to import.
 */
export interface CliCommand {
  /** Space-separated command name as shown in help output. */
  readonly name: string;
  /** Short one-line description. */
  readonly summary: string;
}

/**
 * Public command registry used by help output and future command dispatch.
 *
 * The registry focuses on user-level workflows: check local files, check remote
 * provider state, push only schema-declared variables, and initialize generated
 * Next/lint integrations.
 */
export const cliCommands: readonly CliCommand[] = [
  {
    name: "check local",
    summary: "Validate a local env source against the schema.",
  },
  {
    name: "check vercel",
    summary: "Check Vercel env presence for a target environment.",
  },
  {
    name: "check railway",
    summary: "Check Railway env presence for a service environment.",
  },
  {
    name: "push vercel",
    summary: "Safely push schema-declared env vars to Vercel.",
  },
  {
    name: "push railway",
    summary: "Safely push schema-declared env vars to Railway.",
  },
  { name: "init next", summary: "Create the default Next.js env file layout." },
  {
    name: "init lint",
    summary: "Create Oxlint, Biome, or ESLint env enforcement config.",
  },
  {
    name: "sync next",
    summary: "Regenerate explicit Next.js public env mapping.",
  },
];
