import path from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, lazyPlugins } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const frameworkRoot = realpathSync(path.resolve(root, "node_modules/@jthum/framework"));

export default defineConfig({
  resolve: {
    // Linked Framework UI shares the host's runtime and icon package, not its dev install.
    dedupe: ["svelte", "@lucide/svelte"],
    alias: {
      $lib: path.resolve(root, "src/lib"),
    },
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
      adapter: adapter({
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
});
