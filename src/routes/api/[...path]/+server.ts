import { SERVER_MODE } from "$lib/app/deployment.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  if (!SERVER_MODE) return new Response(null, { status: 404 });
  const { server } = await import("$lib/server/index.ts");
  return (await server()).handle(request);
};
