import { parseCall } from "@jthum/framework-http";
import { asFrameworkError, ERROR_CODES, FrameworkError } from "@jthum/framework/errors";
import type { Deployment, ZeroReadDatabase } from "./model.ts";
import { openKernelRuntime, type RuntimeIdentity } from "./kernel-runtime.ts";
import { ZeroRollbackRequired } from "./transaction.ts";

import { writeMethods } from "./methods.ts";

const modelChanges = new Set([
  "applySpec",
  "applyScopeConfig",
  "deleteScopeConfig",
  "createWorkspace",
  "deleteWorkspace",
]);

export async function handleKernelCall(
  input: unknown,
  db: ZeroReadDatabase,
  deployment: Deployment,
  identity: RuntimeIdentity,
  options: { writable: boolean; releaseId: string; ownerEmail: string },
) {
  let runtime: Awaited<ReturnType<typeof openKernelRuntime>> | undefined;
  try {
    const { method, args } = parseCall(input);
    if (writeMethods.has(method) && !options.writable)
      throw new FrameworkError({
        code: ERROR_CODES.permissionDenied,
        message: "Use the write endpoint for this operation.",
      });
    if (modelChanges.has(method))
      throw new FrameworkError({
        code: ERROR_CODES.persistenceUnsupported,
        message: "Edit the app model in Builder.run and deploy again.",
      });
    if (method === "runInference")
      throw new FrameworkError({
        code: ERROR_CODES.environmentCapabilityUnavailable,
        message: "This target has no inference execution service configured.",
      });
    runtime = await openKernelRuntime(db, deployment, identity, options);
    const result: unknown = await Reflect.apply(runtime.client[method], runtime.client, args);
    runtime.transaction.assertHealthy();
    return { status: 200, body: { result: result ?? null } };
  } catch (cause) {
    if (cause instanceof ZeroRollbackRequired) throw cause;
    runtime?.transaction.assertHealthy();
    const error = asFrameworkError(cause);
    const status =
      error.code === ERROR_CODES.permissionDenied
        ? 403
        : error.code === ERROR_CODES.resourceNotFound
          ? 404
          : error.code === ERROR_CODES.resourceConflict
            ? 409
            : error.code === ERROR_CODES.persistenceUnsupported ||
                error.code === ERROR_CODES.environmentCapabilityUnavailable
              ? 422
              : error.code === ERROR_CODES.internalUnexpected
                ? 500
                : 400;
    return { status, body: { error: error.toEnvelope() } };
  } finally {
    await runtime?.close();
  }
}
