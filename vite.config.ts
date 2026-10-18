import path from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, lazyPlugins, loadEnv } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-static";
import nodeAdapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const frameworkRoot = realpathSync(path.resolve(root, "node_modules/@jthum/framework"));

export default defineConfig(({ mode }) => {
  const deployment =
    process.env.VITE_DEPLOYMENT ?? loadEnv(mode, root, "VITE_").VITE_DEPLOYMENT ?? "local";
  if (!["local", "server"].includes(deployment))
    throw new Error("VITE_DEPLOYMENT must be local or server.");
  return {
    define: { "import.meta.env.VITE_DEPLOYMENT": JSON.stringify(deployment) },
    resolve: {
      // Linked Framework UI shares the host's runtime and icon package, not its dev install.
      dedupe: ["svelte", "@lucide/svelte"],
      alias: {
        $lib: path.resolve(root, "src/lib"),
      },
    },
    ssr: {
      // Keep one server-side Framework identity across linked HTTP/core packages. Svelte source
      // remains compiled by the host; only the built non-Svelte contracts are externalized.
      external: [
        "@jthum/framework/client",
        "@jthum/framework/kernel",
        "@jthum/framework/errors",
        "@jthum/framework/spec",
        "@jthum/framework/sqlite",
        "@jthum/framework/persistence",
        "@jthum/framework/blocks",
        "@jthum/framework/catalog",
        "@jthum/framework-http",
        "@jthum/yair",
        "@jthum/yair-openai",
      ],
    },
    optimizeDeps: {
      exclude: ["wa-sqlite"],
    },
    assetsInclude: ["**/*.wasm"],
    worker: {
      format: "es",
    },
    server: {
      fs: {
        // Local development consumes Framework source through the linked package.
        allow: [root, frameworkRoot],
      },
    },
    staged: {
      "*.{js,ts,tsx,vue,svelte}": "vp check --fix",
    },
    fmt: {},
    lint: {
      jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
      rules: { "vite-plus/prefer-vite-plus-imports": "error" },
      options: { typeAware: true, typeCheck: false },
    },
    plugins: lazyPlugins(() => [
      tailwindcss(),
      sveltekit({
        compilerOptions: {
          // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
        },
        adapter:
          deployment === "server"
            ? nodeAdapter()
            : adapter({
                fallback: "index.html",
              }),
      }),
    ]),
    test: {
      expect: { requireAssertions: true },
      projects: [
        {
          extends: "./vite.config.ts",
          test: {
            name: "server",
            environment: "node",
            include: ["src/**/*.{test,spec}.{js,ts}"],
            exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
          },
        },
      ],
    },
  };
});
