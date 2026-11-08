import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite-plus";

const preparations = new Map<string, Promise<void>>();

/** Build a reusable target template once, never per end-user publication. */
export function deploymentAssets(root: string): Plugin {
  let building = false;
  const prepare = () => {
    let preparing = preparations.get(root);
    if (preparing) return preparing;
    preparing = promisify(execFile)(process.execPath, ["scripts/build-spacefast-browser.mjs"], {
      cwd: root,
      maxBuffer: 8 * 1024 * 1024,
    })
      .then(() => undefined)
      .catch((error) => {
        preparations.delete(root);
        throw error;
      });
    preparations.set(root, preparing);
    return preparing;
  };
  return {
    name: "deployment-assets",
    enforce: "pre",
    configResolved(config) {
      building = config.command === "build";
    },
    async buildStart() {
      if (building) await prepare();
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/deployment-assets/spacefast/")) return next();
        try {
          if (!existsSync(path.join(root, "static/deployment-assets/spacefast/template.json.gz")))
            await prepare();
          next();
        } catch (error) {
          server.config.logger.error(error instanceof Error ? error.message : String(error));
          res.statusCode = 500;
          res.end("Deployment assets could not be prepared.");
        }
      });
    },
  };
}
