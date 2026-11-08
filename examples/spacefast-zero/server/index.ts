import { capsule, endpoint, json } from "@spacefast/zero/server";
import { deployment, releaseId, testDeployment } from "./model.ts";
import { handleKernelCall } from "./runtime.ts";

function allowed(token: string | undefined, authorization: string | null): boolean {
  return !!token && authorization === `Bearer ${token}`;
}

export default capsule({
  name: "Deployment-generated app",
  schema: {
    // Deployment tables.
  },
  endpoints: {
    kernelRead: endpoint(
      { method: "POST", path: "/api/app/read", readOnly: true },
      async (ctx, req) => {
        const probe =
          testDeployment && allowed(ctx.env.PROBE_TOKEN, req.headers.get("authorization"));
        if (!probe && (!ctx.auth.isAuthenticated || !ctx.auth.emailVerified || !ctx.auth.email))
          return json(
            {
              error: {
                code: "PERMISSION.DENIED",
                message: "Sign in with a verified email to continue.",
              },
            },
            { status: 401 },
          );
        const result = await handleKernelCall(
          await req.json(),
          ctx.db,
          deployment,
          probe
            ? {
                subject: "deployment-probe",
                email: ctx.env.OWNER_EMAIL ?? "owner@example.test",
                name: "Deployment owner",
              }
            : {
                subject: `${ctx.auth.provider}:${ctx.auth.userId}`,
                email: ctx.auth.email!,
                name: ctx.auth.displayName,
              },
          {
            writable: false,
            releaseId,
            ownerEmail: ctx.env.OWNER_EMAIL ?? "",
          },
        );
        return json(result.body, { status: result.status });
      },
    ),
    kernelWrite: endpoint({ method: "POST", path: "/api/app/write" }, async (ctx, req) => {
      const probe =
        testDeployment && allowed(ctx.env.PROBE_TOKEN, req.headers.get("authorization"));
      if (!probe && (!ctx.auth.isAuthenticated || !ctx.auth.emailVerified || !ctx.auth.email))
        return json(
          {
            error: {
              code: "PERMISSION.DENIED",
              message: "Sign in with a verified email to continue.",
            },
          },
          { status: 401 },
        );
      const result = await handleKernelCall(
        await req.json(),
        ctx.db,
        deployment,
        probe
          ? {
              subject: "deployment-probe",
              email: ctx.env.OWNER_EMAIL ?? "owner@example.test",
              name: "Deployment owner",
            }
          : {
              subject: `${ctx.auth.provider}:${ctx.auth.userId}`,
              email: ctx.auth.email!,
              name: ctx.auth.displayName,
            },
        {
          writable: true,
          releaseId,
          ownerEmail: ctx.env.OWNER_EMAIL ?? "",
        },
      );
      return json(result.body, { status: result.status });
    }),
    identity: endpoint({ method: "GET", path: "/api/deployed/identity" }, (ctx) =>
      json({
        authenticated: ctx.auth.isAuthenticated,
        guest: ctx.auth.isGuest,
        provider: ctx.auth.provider,
      }),
    ),
  },
});
