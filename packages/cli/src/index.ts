/**
 * Describes a command exposed by the `envy` binary.
 */
export interface CliCommand {
  /** Space-separated command name as shown in help output. */
  readonly name: string;
  /** Short one-line description. */
  readonly summary: string;
}

/**
 * Public command registry used by help output and future command dispatch.
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
