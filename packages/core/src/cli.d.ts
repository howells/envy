/**
 * Process-style output writer accepted by the Envy CLI runner.
 *
 * Tests and wrapper CLIs can pass small in-memory writers here instead of
 * writing to the real process streams.
 */
export interface CliWritable {
  /**
   * Writes CLI output.
   *
   * @param chunk - Text chunk produced by the CLI.
   */
  write(chunk: string): void;
}

/**
 * Injectable process-like IO used by {@link runCli}.
 */
export interface CliIO {
  /** Working directory used to resolve relative schema and env file paths. */
  readonly cwd: string;
  /** Environment object used when a command validates process env directly. */
  readonly env: Record<string, string | undefined>;
  /** Destination for error output and JSON error envelopes. */
  readonly stderr: CliWritable;
  /** Destination for normal output and JSON success envelopes. */
  readonly stdout: CliWritable;
}

/**
 * Runs the Envy command-line interface.
 *
 * This is the same implementation used by the `envy` binary. It is exported so
 * tests, custom CLIs, and agent wrappers can call Envy without spawning a child
 * process.
 *
 * @param argv - Command arguments without `node` or the script path.
 * @param io - Optional process-like IO for tests and wrappers.
 * @returns Process-style exit code.
 */
export function runCli(argv?: readonly string[], io?: CliIO): Promise<number>;

/**
 * Describes the public `envy` command contract.
 *
 * Use this metadata when an agent, editor integration, or CI wrapper needs
 * command names, flags, output shapes, and exit codes without scraping help
 * text.
 *
 * @returns Machine-readable CLI metadata.
 */
export function describeCli(): Record<string, unknown>;

/**
 * Parses dotenv file contents into raw key/value pairs.
 *
 * The parser supports common dotenv syntax used by `envy check local`: blank
 * lines, comments, `export KEY=`, quoted values, inline comments after
 * unquoted values, and empty values.
 *
 * @param contents - Raw dotenv file contents.
 * @returns Parsed key/value pairs.
 */
export function parseDotenv(contents: string): Record<string, string>;
