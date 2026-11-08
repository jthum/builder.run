import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout } from "node:timers/promises";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const help = `Publish an exported app to an existing Spacefast Zero Space.

vp run deploy:spacefast -- --spec app.json --space spc_... --team TEAM --owner you@example.com

Authenticate once with: npx spacefast@0.8.0 login
The destination must be a dedicated existing Space in the specified team.
The command publishes definitions and app assets. It does not upload browser records or secrets.
Model changes must be additive (or retain stable identities for key/label renames).
`;
if (args.includes("--help")) {
  console.log(help);
  process.exit(0);
}
const flags = new Map();
for (let index = 0; index < args.length; index += 2) {
  if (
    !["--spec", "--space", "--team", "--owner"].includes(args[index]) ||
    !args[index + 1] ||
    args[index + 1].startsWith("--")
  )
    throw new Error(help);
  flags.set(args[index], args[index + 1]);
}
for (const key of ["--spec", "--space", "--team", "--owner"])
  if (!flags.get(key)?.trim()) throw new Error(`Missing ${key}.\n${help}`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const spec = resolve(flags.get("--spec"));
const output = resolve(root, ".output/spacefast-zero");
const run = promisify(execFile);
async function sf(args) {
  try {
    const { stdout } = await run("npx", ["--yes", "spacefast@0.8.0", ...args, "--json"], {
      cwd: tmpdir(),
      timeout: 300000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout).data;
  } catch (cause) {
    let fault;
    try {
      fault = JSON.parse(cause.stderr).error;
    } catch {
      throw new Error(
        "Spacefast CLI failed. Check authentication and connectivity before retrying.",
        { cause },
      );
    }
    throw new Error(
      `${fault.code}: ${fault.message}${fault.requestId ? ` (request ${fault.requestId})` : ""}`,
    );
  }
}
const space = flags.get("--space"),
  team = flags.get("--team");
const destination = await sf(["api", "GET", `/v1/spaces/${encodeURIComponent(space)}`]);
if (destination.teamId !== team)
  throw new Error("The Space belongs to another team. Nothing was published.");
console.log("Building the generated app…");
await new Promise((resolve, reject) => {
  const child = execFile(
    process.execPath,
    ["scripts/build-spacefast-zero.mjs", "--spec", spec],
    { cwd: root, maxBuffer: 8 * 1024 * 1024 },
    (error) => (error ? reject(error) : resolve()),
  );
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
});
await sf(["build", output]);
console.log("Configuring the deployment owner…");
// OWNER_EMAIL is identity configuration, not a password or an application invitation.
const { stdout } = await new Promise((resolve, reject) => {
  const child = execFile(
    "npx",
    [
      "--yes",
      "spacefast@0.8.0",
      "env",
      "set",
      "OWNER_EMAIL",
      "--value-from-stdin",
      "--space",
      space,
      "--team",
      team,
      "--json",
    ],
    { cwd: tmpdir(), timeout: 300000 },
    (error, stdout, stderr) =>
      error
        ? reject(new Error("Could not set OWNER_EMAIL. No publish was attempted."))
        : resolve({ stdout, stderr }),
  );
  child.stdin.end(flags.get("--owner"));
});
const operation = JSON.parse(stdout).data.operation.id;
let synchronized = false;
for (let index = 0; index < 60; index++) {
  const response = await sf(["api", "GET", `/v1/operations/${operation}`]);
  const status = (response.operation ?? response).status;
  if (status === "succeeded") {
    synchronized = true;
    break;
  }
  if (["failed", "cancelled", "canceled"].includes(status))
    throw new Error("Owner configuration failed; no publish was attempted.");
  await setTimeout(2000);
}
if (!synchronized)
  throw new Error("Owner configuration is still pending; inspect its status before retrying.");
console.log("Publishing to the selected Space…");
// The CLI's automatic fallback setting runs before upload and rejects first index.html adoption.
// Explicit rewrites in the artifact handle app routes after the new version is installed.
const receipt = await sf(["publish", output, "--space", space, "--team", team, "--spa", "false"]);
const current = await sf(["api", "GET", `/v1/spaces/${encodeURIComponent(space)}`]);
if (
  receipt.next?.action !== "done" ||
  receipt.activation?.outcome !== "activated" ||
  current.teamId !== team ||
  current.channels.live.versionId !== receipt.version.id
)
  throw new Error("Publication did not confirm activation. Inspect the Space before retrying.");
console.log(JSON.stringify({ spaceId: space, versionId: receipt.version.id, status: "activated" }));
