import { createInterface } from "node:readline/promises";
import { Readable, Writable } from "node:stream";
import { resolve } from "node:path";
import { setupServer, type SetupInput } from "./setup.ts";

interface SetupIO {
  readonly input: Readable & { readonly isTTY?: boolean };
  readonly output: Writable & { readonly isTTY?: boolean };
}

const usage = `Usage: node build/setup.mjs [--stdin]

Initialize a new instance in DATA_DIR (default: ./data).
Interactive setup asks for the first user's name, username and password.
--stdin reads a private JSON object with name, username, password and optional spaceName.
Passwords are never accepted as command-line arguments or environment configuration.
`;

export async function runSetupCommand(
  directory: string,
  args: readonly string[],
  io: SetupIO = { input: process.stdin, output: process.stdout },
): Promise<void> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    io.output.write(usage);
    return;
  }
  if (args.length > 1 || (args.length === 1 && args[0] !== "--stdin"))
    throw new Error("Unrecognized setup option. Run node build/setup.mjs --help for usage.");
  await setupServer(directory, () =>
    args[0] === "--stdin" ? readSetupJson(io.input) : promptSetup(io),
  );
  io.output.write(
    `Setup complete. Data directory: ${resolve(directory)}\nStart the server with the same DATA_DIR, then sign in with the username you chose.\n`,
  );
}

async function readSetupJson(input: Readable): Promise<SetupInput> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 16 * 1024) throw new Error("Setup input must not exceed 16 KiB.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as SetupInput;
  } catch {
    throw new Error("Setup input must be valid JSON.");
  }
}

/** readline owns terminal restoration; muting its output hides all password echo and cursor redraws. */
export async function promptSetup(io: SetupIO): Promise<SetupInput> {
  if (!io.input.isTTY || !io.output.isTTY)
    throw new Error(
      "Interactive setup requires a terminal. Use --stdin for automated provisioning.",
    );
  let muted = false;
  const display = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) io.output.write(chunk);
      callback();
    },
  });
  const controller = new AbortController();
  const readline = createInterface({
    input: io.input,
    output: display,
    terminal: true,
    historySize: 0,
  });
  readline.on("SIGINT", () => controller.abort());
  readline.on("close", () => controller.abort());
  const ask = (question: string) => readline.question(question, { signal: controller.signal });
  const secret = async (question: string) => {
    io.output.write(question);
    muted = true;
    try {
      return await ask("");
    } finally {
      muted = false;
      io.output.write("\n");
    }
  };
  try {
    const spaceName = (await ask("Space name [My Space]: ")).trim() || "My Space";
    const name = await ask("Your name: ");
    const username = await ask("Username: ");
    const password = await secret("Password (at least 12 characters): ");
    const confirmation = await secret("Confirm password: ");
    if (password !== confirmation)
      throw new Error("The passwords do not match. Setup has not created any users.");
    return { spaceName, name, username, password };
  } finally {
    readline.close();
    display.end();
  }
}
