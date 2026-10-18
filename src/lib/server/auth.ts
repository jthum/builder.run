import { randomBytes, scrypt, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { nanoid } from "nanoid";
import type { Kernel } from "@jthum/framework/kernel";
import type { SecretCipher } from "@jthum/framework/kernel";
import { DEFAULT_ASSISTANT_SETTINGS, type AssistantSettings } from "$lib/inference/settings.ts";
import { FrameworkError, invalidInput, resourceConflict } from "@jthum/framework/errors";
import { entityEqual, type ModuleStore } from "@jthum/framework/persistence";

const deriveKey = promisify(scrypt);
export const SESSION_COOKIE = "builder_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = "00".repeat(64);

interface Login {
  readonly id: string;
  readonly username: string;
  readonly hash: string;
  readonly salt: string;
  /** Host login bindings, not a Kernel people directory or an authorization grant. */
  readonly actors: Record<string, string>;
  readonly assistant?: Record<string, unknown>;
}
interface LoginSession {
  readonly id: string;
  readonly loginId: string;
  readonly expiresAt: number;
}
export interface Identity {
  readonly realmId: string;
  readonly login: Login;
}

/** Login credentials are host-owned and scoped to their issuance realm. */
export class ServerAuth {
  private loginQueue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly storage: ModuleStore,
    readonly realmId: string,
    private readonly now: () => number,
  ) {}

  static async open(kernel: Kernel, realmId: string, now = Date.now): Promise<ServerAuth> {
    const storage = await kernel.openModuleStorage({
      id: "builder.auth",
      entities: {
        logins: {
          fields: {
            username: { type: "text" },
            hash: { type: "text" },
            salt: { type: "text" },
            actors: { type: "json" },
            assistant: { type: "json", optional: true },
          },
          indexes: [{ fields: ["username"], unique: true }],
        },
        sessions: {
          fields: {
            loginId: { type: "id", references: { entity: "logins", onDelete: "cascade" } },
            expiresAt: { type: "number" },
          },
          indexes: [{ fields: ["expiresAt"] }],
        },
      },
    });
    return new ServerAuth(storage, realmId, now);
  }

  async bootstrap(username: string, password: string | undefined, actorId: string): Promise<void> {
    if ((await this.storage.workspace(this.realmId).query({ from: "logins", limit: 1 })).length)
      return;
    if (!password)
      throw new Error("Set SERVER_ADMIN_PASSWORD (at least 12 characters) for first-run setup.");
    await this.createLogin(this.realmId, username, password, { [this.realmId]: actorId });
  }

  createLogin(
    realmId: string,
    username: string,
    password: string,
    actors: Record<string, string> | (() => Promise<Record<string, string>>),
  ): Promise<void> {
    // Validate and check the username before provisioning its Actor. Serialize rare login
    // creation so concurrent requests cannot both provision people for the same credential.
    const pending = this.loginQueue.then(async () => {
      username = username.trim().toLowerCase();
      if (
        !/^[a-z0-9][a-z0-9._@+-]{0,127}$/.test(username) ||
        password.length < 12 ||
        password.length > 1024
      )
        throw invalidInput("Use a valid username and a password of at least 12 characters.");
      const store = this.storage.workspace(realmId);
      if (
        (await store.query({ from: "logins", where: entityEqual("username", username), limit: 1 }))
          .length
      )
        throw resourceConflict("This username is already in use in this login realm.");
      const salt = randomBytes(16).toString("hex");
      const hash = ((await deriveKey(password, salt, 64)) as Buffer).toString("hex");
      const bindings = typeof actors === "function" ? await actors() : actors;
      await store.insert("logins", { id: nanoid(), username, salt, hash, actors: bindings });
    });
    this.loginQueue = pending.catch(() => {});
    return pending;
  }

  async login(username: string, password: string, realmId = this.realmId): Promise<string> {
    if (username.length > 128 || password.length > 1024) throw authenticationRequired();
    const store = this.storage.workspace(realmId);
    const [login] = await store.query<Login>({
      from: "logins",
      where: entityEqual("username", username.trim().toLowerCase()),
      limit: 1,
    });
    // Derive even for unknown users; login responses never reveal which component was wrong.
    const key = (await deriveKey(password, login?.salt ?? "unregistered-login", 64)) as Buffer;
    if (!timingSafeEqual(key, Buffer.from(login?.hash ?? DUMMY_HASH, "hex")) || !login)
      throw authenticationRequired();
    const secret = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + SESSION_MS;
    await store.transaction(async (tx) => {
      const expired = await tx.query<LoginSession>({
        from: "sessions",
        where: { op: "lte", left: { field: "expiresAt" }, right: { value: this.now() } },
        limit: 100,
      });
      for (const session of expired) await tx.delete("sessions", session.id);
      await tx.insert("sessions", { id: digest(secret), loginId: login.id, expiresAt });
    });
    return Buffer.from(JSON.stringify({ realmId, secret })).toString("base64url");
  }

  async authenticate(token: string | undefined): Promise<Identity> {
    const parsed = readToken(token);
    if (!parsed) throw authenticationRequired();
    const store = this.storage.workspace(parsed.realmId);
    const session = await store.get<LoginSession>("sessions", digest(parsed.secret));
    if (!session || session.expiresAt <= this.now()) throw authenticationRequired();
    const login = await store.get<Login>("logins", session.loginId);
    if (!login) throw authenticationRequired();
    return { realmId: parsed.realmId, login };
  }

  async linkActor(identity: Identity, spaceId: string, actorId: string): Promise<void> {
    const store = this.storage.workspace(identity.realmId);
    await store.transaction(async (tx) => {
      const current = await tx.get<Login>("logins", identity.login.id);
      if (!current) throw authenticationRequired();
      await tx.update("logins", current.id, { actors: { ...current.actors, [spaceId]: actorId } });
    });
  }

  async refreshIdentity(identity: Identity): Promise<Identity> {
    const login = await this.storage
      .workspace(identity.realmId)
      .get<Login>("logins", identity.login.id);
    if (!login) throw authenticationRequired();
    return { realmId: identity.realmId, login };
  }

  async getAssistantSettings(
    identity: Identity,
    cipher: SecretCipher,
    reveal = false,
  ): Promise<AssistantSettings> {
    const login = await this.storage
      .workspace(identity.realmId)
      .get<Login>("logins", identity.login.id);
    const settings = login?.assistant;
    return {
      baseUrl:
        typeof settings?.baseUrl === "string"
          ? settings.baseUrl
          : DEFAULT_ASSISTANT_SETTINGS.baseUrl,
      model: typeof settings?.model === "string" ? settings.model : "",
      apiKey: settings?.secret
        ? reveal
          ? await cipher.decrypt(
              settings.secret as Parameters<SecretCipher["decrypt"]>[0],
              identity.realmId,
              `assistant.${identity.login.id}`,
            )
          : "••••••••"
        : "",
    };
  }

  async putAssistantSettings(
    identity: Identity,
    input: AssistantSettings,
    cipher: SecretCipher,
  ): Promise<void> {
    if (
      typeof input.baseUrl !== "string" ||
      typeof input.model !== "string" ||
      typeof input.apiKey !== "string"
    )
      throw invalidInput("Invalid assistant settings.");
    let endpoint: URL;
    try {
      endpoint = new URL(input.baseUrl);
    } catch {
      throw invalidInput("Use a valid provider URL.");
    }
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password)
      throw invalidInput("Use an HTTP(S) provider URL without embedded credentials.");
    const store = this.storage.workspace(identity.realmId);
    const current = await store.get<Login>("logins", identity.login.id);
    const secret =
      input.apiKey === "••••••••"
        ? current?.assistant?.secret
        : input.apiKey
          ? await cipher.encrypt(input.apiKey, identity.realmId, `assistant.${identity.login.id}`)
          : null;
    await store.update("logins", identity.login.id, {
      assistant: { baseUrl: input.baseUrl, model: input.model, ...(secret ? { secret } : {}) },
    });
  }

  async logout(token: string | undefined): Promise<void> {
    const parsed = readToken(token);
    if (parsed)
      await this.storage.workspace(parsed.realmId).delete("sessions", digest(parsed.secret));
  }
}

function digest(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
function readToken(token: string | undefined): { realmId: string; secret: string } | null {
  if (!token || token.length > 2048) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("realmId" in parsed) ||
      !("secret" in parsed) ||
      typeof parsed.realmId !== "string" ||
      typeof parsed.secret !== "string" ||
      parsed.secret.length !== 43
    )
      return null;
    return { realmId: parsed.realmId, secret: parsed.secret };
  } catch {
    return null;
  }
}
export function authenticationRequired(): FrameworkError {
  return new FrameworkError({
    code: "AUTH.REQUIRED",
    message: "Sign in with a valid username and password.",
  });
}
