import { defineEnvVars } from "@sveltejs/kit/env";

/** Private, runtime configuration. No secrets are inlined into the browser or server build. */
export const variables = defineEnvVars({
  DATA_DIR: { schema: (value) => value ?? "./data" },
  SERVER_ADMIN_USERNAME: { schema: (value) => value ?? "admin" },
  SERVER_ADMIN_PASSWORD: { schema: (value) => value },
  ORIGIN: { schema: (value) => value },
});
