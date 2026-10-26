import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// An opt-in network/build check, deliberately outside the source checkout and without its links.
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(path.join(tmpdir(), "builder-install-"));
function run(command, args) {
  execFileSync(command, args, {
    cwd: directory,
    // `vp run test:install` prepends the caller's tools. Use the fixture's installed tools instead
    // so Vite/Vitest and SvelteKit share the same module identity, just as in a fresh clone.
    env: {
      ...process.env,
      PATH: [
        path.join(directory, "node_modules/.bin"),
        ...(process.env.PATH ?? "")
          .split(path.delimiter)
          .filter((entry) => !entry.endsWith(`${path.sep}node_modules${path.sep}.bin`)),
      ].join(path.delimiter),
      VITE_DEPLOYMENT: "local",
    },
    stdio: "inherit",
    timeout: 600_000,
  });
}

try {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: root,
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean);
  for (const file of new Set(files)) {
    const source = path.join(root, file);
    // Git can list deleted tracked files and untracked directories (including agent-skill links).
    if (!existsSync(source) || statSync(source).isDirectory()) continue;
    const destination = path.join(directory, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(source, destination);
  }
  run("vp", ["install", "--frozen-lockfile"]);
  const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  for (const name of Object.keys(manifest.dependencies).filter((name) =>
    name.startsWith("@jthum/"),
  )) {
    const installed = realpathSync(path.join(directory, "node_modules", name));
    assert.ok(installed.startsWith(`${directory}${path.sep}`), `${name} escaped the installation`);
  }
  run("vp", ["run", "check"]);
  run("vp", ["test", "--run"]);
  run("vp", ["build"]);
  run("vp", ["run", "build:server"]);
  run("vp", ["run", "test:server"]);
  console.log("Standalone install, both builds, and server workflows passed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
