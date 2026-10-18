/** Selected at build time; server startup never silently falls back to browser storage. */
export const SERVER_MODE = import.meta.env.VITE_DEPLOYMENT === "server";
