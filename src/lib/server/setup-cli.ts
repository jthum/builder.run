import { runSetupCommand } from "./setup-command.ts";

try {
  await runSetupCommand(process.env.DATA_DIR ?? "./data", process.argv.slice(2));
} catch (error) {
  const cancelled = error instanceof Error && error.name === "AbortError";
  console.error(
    cancelled ? "Setup cancelled." : error instanceof Error ? error.message : "Setup failed.",
  );
  process.exitCode = cancelled ? 130 : 1;
}
