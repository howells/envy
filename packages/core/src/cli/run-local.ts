import { spawn } from "node:child_process";
import type { CliIO } from "./commands.js";
import { readDotenvInput } from "./dotenv-input.js";
import type { Flags } from "./flags.js";
import { CliInputError, exitCodes } from "./problem.js";
import { checkModes, importEnvSchema, parseWithMode } from "./schema.js";

/**
 * Validates env, then runs the command after `--` with the dotenv files loaded
 * into its environment. Process env wins over file values.
 *
 * @returns The child's exit code. Envy writes nothing of its own on success.
 */
export async function runLocal(flags: Flags, io: CliIO): Promise<number> {
  const mode = flags.oneOf("mode", checkModes);
  const schema = await importEnvSchema(flags, io.cwd);
  const childEnv = { ...(await readDotenvInput(flags, io.cwd)), ...io.env };
  parseWithMode(schema, childEnv, mode);

  const [executable = "", ...args] = flags.command;
  return spawnCommand(executable, args, childEnv, io);
}

function spawnCommand(
  executable: string,
  args: readonly string[],
  env: Record<string, string | undefined>,
  io: CliIO,
): Promise<number> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(executable, args, {
      cwd: io.cwd,
      env,
      shell: process.platform === "win32",
      stdio: ["inherit", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      io.stdout.write(chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      io.stderr.write(chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      reject(
        new CliInputError(`Command could not be started: ${executable}`, [
          error.message,
        ]),
      );
    });
    child.on("close", (code, signal) => {
      if (signal) {
        resolveProcess(128);
        return;
      }

      resolveProcess(typeof code === "number" ? code : exitCodes.software);
    });
  });
}
