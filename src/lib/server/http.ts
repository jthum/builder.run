import {
  createWorkspaceHandler,
  readJsonRequest,
  jsonResponse,
  errorResponse,
} from "@jthum/framework-http";
import { FrameworkError, invalidInput } from "@jthum/framework/errors";
import { ServerRuntime } from "./runtime.ts";
import { SESSION_COOKIE } from "./auth.ts";
import type { AppSelection } from "$lib/framework/bootstrap.ts";
import type { SetupInput } from "./setup.ts";

/** All cookie-authenticated mutations require a same-origin request, including login/logout. */
export function createServerHandler(
  runtime: ServerRuntime,
  options: { readonly origin?: string } = {},
): (request: Request) => Promise<Response> {
  const configuredOrigin = options.origin ? new URL(options.origin).origin : undefined;
  const attempts = new Map<string, { count: number; until: number }>();
  return async (request) => {
    const url = new URL(request.url);
    try {
      if (request.method !== "POST")
        return new Response(null, { status: 405, headers: { allow: "POST" } });
      const origin = configuredOrigin ?? url.origin;
      if (request.headers.get("origin") !== origin)
        throw new FrameworkError({
          code: "PERMISSION.DENIED",
          message: "A same-origin request is required.",
        });
      const token = cookie(request.headers.get("cookie"), SESSION_COOKIE);
      if (url.pathname === "/api/setup/status")
        return jsonResponse({ result: { required: runtime.setupRequired } });
      if (url.pathname === "/api/setup") {
        if (!runtime.setupRequired)
          throw new FrameworkError({
            code: "RESOURCE.CONFLICT",
            message: "Setup is complete. Sign in to continue.",
          });
        const body = object(await readJsonRequest(request, 8192));
        if (
          Object.keys(body).some(
            (key) => !["name", "username", "password", "spaceName"].includes(key),
          )
        )
          throw invalidInput("Invalid setup request.");
        await runtime.setup(body as unknown as SetupInput);
        const session = await runtime.auth.login(text(body.username), text(body.password));
        const response = jsonResponse({ result: null });
        response.headers.set("set-cookie", sessionCookie(session, origin.startsWith("https:")));
        return response;
      }
      if (url.pathname === "/api/login") {
        const body = object(await readJsonRequest(request, 8192));
        const username = text(body.username);
        const key = `${typeof body.realmId === "string" ? body.realmId : runtime.auth.realmId}:${username.toLowerCase()}`;
        const now = Date.now();
        const attempt = attempts.get(key);
        if (attempt && attempt.until > now && attempt.count >= 8)
          return jsonResponse(
            {
              error: {
                code: "AUTH.RATE_LIMITED",
                message: "Too many sign-in attempts. Try again in a minute.",
              },
            },
            429,
          );
        if (attempts.size > 10_000) {
          for (const [id, value] of attempts) if (value.until < now) attempts.delete(id);
          if (attempts.size > 10_000) return new Response(null, { status: 429 });
        }
        attempts.set(key, {
          count: attempt && attempt.until > now ? attempt.count + 1 : 1,
          until: attempt && attempt.until > now ? attempt.until : now + 60_000,
        });
        const session = await runtime.auth.login(
          username,
          text(body.password),
          typeof body.realmId === "string" ? body.realmId : undefined,
        );
        attempts.delete(key);
        const response = jsonResponse({ result: null });
        response.headers.set("set-cookie", sessionCookie(session, origin.startsWith("https:")));
        return response;
      }
      const identity = await runtime.auth.authenticate(token);
      if (url.pathname === "/api/logout") {
        await runtime.auth.logout(token);
        const response = jsonResponse({ result: null });
        response.headers.set("set-cookie", sessionCookie("", origin.startsWith("https:"), true));
        return response;
      }
      if (url.pathname.startsWith("/api/workspaces/")) {
        const workspaceId = decodeURIComponent(url.pathname.slice("/api/workspaces/".length));
        const spaceId = text(url.searchParams.get("spaceId"));
        const appId = url.searchParams.get("appId") ?? undefined;
        return createWorkspaceHandler({
          resolveClient: () => runtime.workspaceClient(identity, workspaceId, spaceId, appId),
          // Revision changes are conservative: reads do not invalidate screens.
          onCall: (method) => {
            if (!/^(?:get|list|query|preview)/.test(method)) runtime.changed(spaceId);
          },
          onError: (error) => {
            if (!(error instanceof FrameworkError))
              console.error("Workspace request failed", error);
          },
        })(request);
      }
      if (url.pathname === "/api/app") {
        const body = object(await readJsonRequest(request));
        if (Object.keys(body).some((key) => !["command", "selection", "input"].includes(key)))
          throw invalidInput("Invalid app request.");
        const selection = body.selection == null ? undefined : readSelection(body.selection);
        const result = await runtime.command(
          identity,
          text(body.command),
          selection,
          body.input == null ? {} : object(body.input),
        );
        return jsonResponse({ result: result ?? null });
      }
      return new Response(null, { status: 404 });
    } catch (error) {
      if (!(error instanceof FrameworkError)) console.error("Server request failed", error);
      return errorResponse(error);
    }
  };
}

function readSelection(value: unknown): Partial<AppSelection> {
  const input = object(value);
  if (Object.keys(input).some((key) => !["spaceId", "appId"].includes(key)))
    throw invalidInput("Invalid selection.");
  return {
    ...(input.spaceId === undefined ? {} : { spaceId: text(input.spaceId) }),
    ...(input.appId === undefined ? {} : { appId: text(input.appId) }),
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalidInput("An object is required.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw invalidInput("A value is required.");
  return value;
}
function cookie(header: string | null, name: string): string | undefined {
  return header
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
function sessionCookie(value: string, secure: boolean, clear = false): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : 7 * 24 * 60 * 60}${secure ? "; Secure" : ""}`;
}
