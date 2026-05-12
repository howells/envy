/**
 * Public command metadata for the `envy` binary.
 *
 * The installable binary now ships from `@howells/envy`. This private workspace
 * package keeps command metadata available while longer-lived CLI packaging
 * decisions settle.
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
 * The implemented command validates local env state before a deployment or CI
 * job proceeds.
 */
export const cliCommands: readonly CliCommand[] = [
  {
    name: "check local",
    summary: "Validate a local env source against the schema.",
  },
];
