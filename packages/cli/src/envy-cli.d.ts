declare module "@howells/envy/cli" {
  export function runCli(argv?: readonly string[]): Promise<number>;
}
