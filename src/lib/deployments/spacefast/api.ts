import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { DeploymentFile } from "../../../../examples/spacefast-zero/deployment/browser.ts";

const origin = "https://api.spacefast.com";
export class SpacefastError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
interface Next {
  action: "upload" | "finalize" | "poll" | "done";
  url?: string;
  retryAfter?: number;
}
interface Upload {
  targets: {
    path: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
  }[];
}
interface Receipt {
  space: { id: string; teamId?: string; liveUrl?: string };
  version?: { id: string };
  next: Next;
  upload?: Upload;
  links: { finalize?: string; refresh?: string };
  activation?: { outcome: string };
  diagnostics?: unknown;
}
export interface Team {
  id: string;
  name: string;
}
export interface Space {
  id: string;
  teamId: string;
  title: string;
  channels: { live: { versionId: string | null } };
}

/** The key stays in this ephemeral client; the configured transport forwards requests to Spacefast. */
export class SpacefastApi {
  private creating?: { teamId: string; title: string; key: string };
  constructor(
    private readonly key: string,
    private readonly send: typeof fetch = fetch,
  ) {}
  private async envelope<T>(
    path: string,
    method = "GET",
    body?: unknown,
    options: { signal?: AbortSignal; idempotencyKey?: string } = {},
  ): Promise<{ data: T; operation?: { id: string }; pagination?: { nextCursor?: string } }> {
    const url = new URL(path, origin);
    if (url.origin !== origin)
      throw new SpacefastError(
        "DEPLOYMENT.INVALID_URL",
        "Spacefast returned an unexpected API URL.",
      );
    let response: Response;
    try {
      response = await this.send(url, {
        method,
        credentials: "omit",
        redirect: "error",
        headers: {
          authorization: `Bearer ${this.key}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)])
          : AbortSignal.timeout(60000),
      });
    } catch (cause) {
      if (options.signal?.aborted) throw cause;
      throw new SpacefastError(
        "DEPLOYMENT.CONNECTION_FAILED",
        "Could not reach Spacefast through the configured publishing connection. Check your network and relay configuration, or Spacefast’s CORS policy when connecting directly.",
      );
    }
    const envelope = await response.json();
    if (!response.ok) {
      const error = envelope.error ?? envelope;
      throw new SpacefastError(
        error.code ?? "DEPLOYMENT.REQUEST_FAILED",
        error.message ?? error.detail ?? `Spacefast returned HTTP ${response.status}.`,
        error.requestId ?? response.headers.get("x-request-id") ?? undefined,
        response.status,
      );
    }
    return envelope;
  }
  async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    options: { signal?: AbortSignal; idempotencyKey?: string } = {},
  ): Promise<T> {
    return (await this.envelope<T>(path, method, body, options)).data;
  }
  async spaces(team: string, query = "", cursor?: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ team, query, limit: "50", ...(cursor ? { cursor } : {}) });
    const result = await this.envelope<Space[]>(`/v1/spaces?${params}`, "GET", undefined, {
      signal,
    });
    return { spaces: result.data, nextCursor: result.pagination?.nextCursor };
  }
  bootstrap(signal?: AbortSignal) {
    return this.request<{
      teams: Team[];
      teamsPagination: { hasMore: boolean };
      me: { email?: string };
    }>("/v1/bootstrap", "GET", undefined, { signal });
  }
  space(id: string, signal?: AbortSignal) {
    return this.request<Space>(`/v1/spaces/${encodeURIComponent(id)}`, "GET", undefined, {
      signal,
    });
  }
  async createSpace(teamId: string, title: string, signal?: AbortSignal) {
    if (this.creating && (this.creating.teamId !== teamId || this.creating.title !== title))
      throw new SpacefastError(
        "DEPLOYMENT.UNCERTAIN_CREATE",
        "Check the previous Space creation before choosing a different destination.",
      );
    this.creating ??= { teamId, title, key: crypto.randomUUID() };
    const result = await this.request<{ space: Space }>(
      "/v1/spaces",
      "POST",
      { teamId, title, capabilities: ["optional_access"] },
      { idempotencyKey: this.creating.key, signal },
    );
    this.creating = undefined;
    return result.space;
  }
  async schema(id: string, signal?: AbortSignal) {
    try {
      const response = await this.request<{
        tables: import("@spacefast/common/contracts/zero").ZeroTable[];
      }>(`/v1/spaces/${encodeURIComponent(id)}/db`, "GET", undefined, { signal });
      return Object.fromEntries(response.tables.map((table) => [table.name, table]));
    } catch (error) {
      if (error instanceof SpacefastError && error.status === 404) return {};
      throw error;
    }
  }
  async setOwner(id: string, email: string, signal?: AbortSignal) {
    const response = await this.envelope<unknown>(
      `/v1/spaces/${encodeURIComponent(id)}/variables/OWNER_EMAIL`,
      "PUT",
      { value: email, secret: false },
      { signal },
    );
    if (response.operation)
      await this.waitOperation(`/v1/operations/${response.operation.id}`, signal);
  }
  private async pause(seconds: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal?.reason);
      };
      const timer = setTimeout(
        () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        },
        Math.max(1, seconds) * 1000,
      );
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  private async waitOperation(path: string, signal?: AbortSignal) {
    for (;;) {
      const response = await this.request<{
        status: string;
        operation?: { status: string };
        error?: { message: string };
      }>(path, "GET", undefined, { signal });
      const operation = response.operation ?? response;
      if (operation.status === "succeeded") return;
      if (["failed", "canceled", "cancelled"].includes(operation.status))
        throw new SpacefastError(
          "DEPLOYMENT.FINALIZATION_FAILED",
          response.error?.message ??
            "Spacefast could not finalize this version. Inspect the Space before publishing again.",
        );
      await this.pause(2, signal);
    }
  }
  startPublish(
    input: { spaceId: string; teamId: string; files: DeploymentFile[]; sourceMetadata: unknown },
    onProgress: (message: string) => void,
  ) {
    return new SpacefastPublish(this, input, onProgress, this.send);
  }
}

/** Retains the exact initial request and its idempotency key for safe in-dialog retries. */
export class SpacefastPublish {
  private receipt?: Receipt;
  private pending?: { path: string };
  private finalized = false;
  private readonly finalizeKey = crypto.randomUUID();
  private initialBody?: unknown;
  private readonly idempotencyKey = crypto.randomUUID();
  private uploaded = new Set<string>();
  constructor(
    private readonly api: SpacefastApi,
    private readonly input: {
      spaceId: string;
      teamId: string;
      files: DeploymentFile[];
      sourceMetadata: unknown;
    },
    private readonly progress: (message: string) => void,
    private readonly send: typeof fetch,
  ) {}
  async run(signal?: AbortSignal): Promise<{ spaceId: string; versionId: string; url?: string }> {
    if (!this.initialBody)
      this.initialBody = {
        spaceId: this.input.spaceId,
        teamId: this.input.teamId,
        sourceMetadata: this.input.sourceMetadata,
        files: this.input.files.map((file) => ({
          path: file.path,
          size: file.bytes.length,
          contentType: file.contentType,
          sha256: bytesToHex(sha256(file.bytes)),
        })),
      };
    if (!this.receipt) {
      this.progress("Starting publication…");
      this.receipt = await this.api.request<Receipt>("/v1/publish", "POST", this.initialBody, {
        signal,
        idempotencyKey: this.idempotencyKey,
      });
    }
    const original = this.receipt;
    if (
      original.space.id !== this.input.spaceId ||
      (original.space.teamId !== undefined && original.space.teamId !== this.input.teamId)
    )
      throw new SpacefastError(
        "DEPLOYMENT.WRONG_DESTINATION",
        "Spacefast returned a different destination. Publication stopped.",
      );
    if (this.finalized) return this.verify(signal);
    let next = original.next;
    let upload = original.upload;
    if (next.action === "upload" && original.links.refresh) {
      const refreshed = await this.api.request<{ upload: Upload | null }>(
        original.links.refresh,
        "POST",
        {},
        { signal },
      );
      upload = refreshed.upload ?? undefined;
      if (!upload) next = { action: "finalize", url: original.links.finalize };
    }
    if (this.pending) {
      const version = await this.api.request<{ status: string }>(
        `/v1/spaces/${encodeURIComponent(this.input.spaceId)}/versions/${encodeURIComponent(original.version!.id)}`,
        "GET",
        undefined,
        { signal },
      );
      if (["created", "uploading", "uploaded"].includes(version.status))
        await this.finalize(this.pending.path, signal);
      return this.verify(signal);
    }
    while (next.action !== "done") {
      signal?.throwIfAborted();
      if (next.action === "upload") {
        for (const target of upload?.targets ?? []) {
          const file = this.input.files.find((file) => file.path === target.path);
          if (!file || target.body)
            throw new SpacefastError(
              "DEPLOYMENT.INVALID_UPLOAD",
              "Spacefast returned an unsupported upload instruction.",
            );
          const url = new URL(target.url);
          if (url.protocol !== "https:")
            throw new SpacefastError(
              "DEPLOYMENT.INVALID_URL",
              "Spacefast returned an insecure upload destination.",
            );
          this.progress(`Uploading ${this.uploaded.size + 1} of ${this.input.files.length} files…`);
          const response = await this.send(url, {
            method: target.method,
            headers: target.headers,
            body: new Blob([file.bytes as Uint8Array<ArrayBuffer>]),
            credentials: "omit",
            redirect: "error",
            signal,
          });
          if (!response.ok)
            throw new SpacefastError(
              "DEPLOYMENT.UPLOAD_FAILED",
              `Upload failed (${response.status}). Retry to refresh the upload session.`,
            );
          this.uploaded.add(target.path);
        }
        const refreshed = await this.api.request<{ upload: Upload | null }>(
          original.links.refresh ?? next.url!,
          "POST",
          {},
          { signal },
        );
        upload = refreshed.upload ?? undefined;
        if (!upload) next = { action: "finalize", url: original.links.finalize };
      } else if (next.action === "finalize") {
        if (!next.url)
          throw new SpacefastError(
            "DEPLOYMENT.INVALID_RECEIPT",
            "Spacefast omitted the finalize URL.",
          );
        this.pending = { path: next.url };
        await this.finalize(next.url, signal);
        break;
      } else if (next.action === "poll") {
        if (!next.url)
          throw new SpacefastError(
            "DEPLOYMENT.INVALID_RECEIPT",
            "Spacefast omitted the status URL.",
          );
        this.progress("Waiting for Spacefast…");
        const delay = next.retryAfter ?? 2;
        await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 30) * 1000));
        const response = await this.api.request<Receipt & { status?: string }>(
          next.url,
          "GET",
          undefined,
          { signal },
        );
        if (response.next) {
          next = response.next;
          upload = response.upload;
        } else if (response.status === "succeeded" || response.status === "ready") break;
        else if (["failed", "canceled", "expired"].includes(response.status ?? ""))
          throw new SpacefastError(
            "DEPLOYMENT.FINALIZATION_FAILED",
            "Spacefast could not finalize the version.",
          );
        else if (!response.status)
          throw new SpacefastError(
            "DEPLOYMENT.INVALID_RECEIPT",
            "Spacefast returned an unexpected publish status.",
          );
      }
    }
    return this.verify(signal);
  }
  private async finalize(path: string, signal?: AbortSignal) {
    this.progress("Activating your app…");
    const result = await this.api.request<{ id: string; status: string }>(
      path,
      "POST",
      {},
      { signal, idempotencyKey: this.finalizeKey },
    );
    if (result.status === "failed")
      throw new SpacefastError(
        "DEPLOYMENT.FINALIZATION_FAILED",
        "Spacefast rejected the version. Inspect its diagnostics before publishing again.",
      );
    this.pending = undefined;
    this.finalized = true;
  }
  private async verify(signal?: AbortSignal) {
    const id = this.receipt?.version?.id;
    if (!id)
      throw new SpacefastError(
        "DEPLOYMENT.INVALID_RECEIPT",
        "Spacefast did not return a version identity.",
      );
    for (;;) {
      const space = await this.api.space(this.input.spaceId, signal);
      if (space.teamId !== this.input.teamId)
        throw new SpacefastError(
          "DEPLOYMENT.WRONG_DESTINATION",
          "Space ownership changed during publication.",
        );
      const version = await this.api.request<{ status: string }>(
        `/v1/spaces/${encodeURIComponent(space.id)}/versions/${encodeURIComponent(id)}`,
        "GET",
        undefined,
        { signal },
      );
      if (version.status === "ready") {
        if (space.channels.live.versionId !== id)
          throw new SpacefastError(
            "DEPLOYMENT.NOT_ACTIVATED",
            "The version is ready but is not live. Check the Space's promotion policy.",
          );
        return { spaceId: space.id, versionId: id, url: this.receipt?.space.liveUrl };
      }
      if (["failed", "expired", "canceled"].includes(version.status))
        throw new SpacefastError(
          "DEPLOYMENT.FINALIZATION_FAILED",
          `Spacefast version status: ${version.status}.`,
        );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      signal?.throwIfAborted();
    }
  }
}
