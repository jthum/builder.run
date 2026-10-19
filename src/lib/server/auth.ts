import { randomBytes, scrypt, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { nanoid } from "nanoid";
import type { Kernel } from "@jthum/framework/kernel";
import type { SecretCipher } from "@jthum/framework/kernel";
import { DEFAULT_ASSISTANT_SETTINGS, type AssistantSettings } from "$lib/inference/settings.ts";
import { FrameworkError, invalidInput, resourceConflict } from "@jthum/framework/errors";
import {
  entityAnd,
  entityEqual,
  type ModuleStore,
  type ModuleTransaction,
} from "@jthum/framework/persistence";
import type { SecurityInfo } from "$lib/app/access.ts";

const deriveKey = promisify(scrypt);
export const SESSION_COOKIE = "builder_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = "00".repeat(64);

interface Login {
  readonly id: string;
  readonly username: string;
  readonly hash: string;
  readonly salt: string;
  /** Issuance Actor for indexed realm-local administration; actors also binds independent Spaces. */
  readonly actorId: string;
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
  readonly sessionId: string;
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
            actorId: { type: "id" },
            actors: { type: "json" },
            assistant: { type: "json", optional: true },
          },
          indexes: [{ fields: ["username"], unique: true }, { fields: ["actorId"] }],
        },
        sessions: {
          fields: {
            loginId: { type: "id", references: { entity: "logins", onDelete: "cascade" } },
            expiresAt: { type: "number" },
          },
          indexes: [{ fields: ["expiresAt"] }, { fields: ["loginId", "expiresAt"] }],
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
      if (!/^[a-z0-9][a-z0-9._@+-]{0,127}$/.test(username))
        throw invalidInput(
          "Use a username containing letters, numbers, dots, dashes or underscores.",
        );
      validatePassword(password);
      const store = this.storage.workspace(realmId);
      if (
        (await store.query({ from: "logins", where: entityEqual("username", username), limit: 1 }))
          .length
      )
        throw resourceConflict("This username is already in use in this login realm.");
      const salt = randomBytes(16).toString("hex");
      const hash = ((await deriveKey(password, salt, 64)) as Buffer).toString("hex");
      const bindings = typeof actors === "function" ? await actors() : actors;
      const actorId = bindings[realmId];
      if (!actorId)
        throw invalidInput("The login must be bound to an Actor in its issuance Space.");
      await store.insert("logins", {
        id: nanoid(),
        username,
        salt,
        hash,
        actorId,
        actors: bindings,
      });
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
      // A password change may have completed while scrypt was running.
      if ((await tx.get<Login>("logins", login.id))?.hash !== login.hash)
        throw authenticationRequired();
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
    return { realmId: parsed.realmId, login, sessionId: session.id };
  }

  async assertActive(identity: Identity): Promise<void> {
    const session = await this.storage
      .workspace(identity.realmId)
      .get<LoginSession>("sessions", identity.sessionId);
    if (!session || session.loginId !== identity.login.id || session.expiresAt <= this.now())
      throw authenticationRequired();
  }

  async security(identity: Identity): Promise<SecurityInfo> {
    await this.assertActive(identity);
    const sessions = await this.storage.workspace(identity.realmId).query<LoginSession>({
      from: "sessions",
      where: entityAnd(entityEqual("loginId", identity.login.id), {
        op: "gt",
        left: { field: "expiresAt" },
        right: { value: this.now() },
      }),
      orderBy: [{ expression: { field: "expiresAt" }, direction: "desc" }],
    });
    return {
      username: identity.login.username,
      sessions: sessions.map((session) => ({
        id: session.id,
        current: session.id === identity.sessionId,
        createdAt: new Date(session.expiresAt - SESSION_MS).toISOString(),
        expiresAt: new Date(session.expiresAt).toISOString(),
      })),
    };
  }

  async changePassword(
    identity: Identity,
    currentPassword: string,
    password: string,
  ): Promise<void> {
    validatePassword(password);
    if (currentPassword.length > 1024) throw invalidInput("The current password is incorrect.");
    const store = this.storage.workspace(identity.realmId);
    const current = await store.get<Login>("logins", identity.login.id);
    if (!current) throw authenticationRequired();
    const key = (await deriveKey(currentPassword, current.salt, 64)) as Buffer;
    if (!timingSafeEqual(key, Buffer.from(current.hash, "hex")))
      throw invalidInput("The current password is incorrect.");
    const salt = randomBytes(16).toString("hex");
    const hash = ((await deriveKey(password, salt, 64)) as Buffer).toString("hex");
    await store.transaction(async (tx) => {
      const session = await tx.get<LoginSession>("sessions", identity.sessionId);
      if (!session || session.loginId !== current.id || session.expiresAt <= this.now())
        throw authenticationRequired();
      if ((await tx.get<Login>("logins", current.id))?.hash !== current.hash)
        throw resourceConflict("Your password changed. Please try again.");
      await tx.update("logins", current.id, { salt, hash });
      await this.deleteSessions(tx, current.id, identity.sessionId);
    });
  }

  async revokeSession(identity: Identity, id?: string): Promise<void> {
    await this.assertActive(identity);
    const store = this.storage.workspace(identity.realmId);
    await store.transaction(async (tx) => {
      if (id !== undefined) {
        const session = await tx.get<LoginSession>("sessions", id);
        if (!session || session.loginId !== identity.login.id || id === identity.sessionId)
          throw invalidInput("Choose another session belonging to your login.");
        await tx.delete("sessions", id);
      } else await this.deleteSessions(tx, identity.login.id, identity.sessionId);
    });
  }

  /** Only realm-local logins are exposed to that Space's managers. */
  async localLogins(spaceId: string): Promise<readonly { actorId: string; username: string }[]> {
    const logins = await this.storage
      .workspace(spaceId)
      .query<{ username: string; actorId: string }>({
        from: "logins",
        select: { username: { field: "username" }, actorId: { field: "actorId" } },
      });
    return logins;
  }

  async revokeActorSessions(spaceId: string, actorId: string): Promise<void> {
    const store = this.storage.workspace(spaceId);
    await store.transaction(async (tx) => {
      const logins = await tx.query<{ id: string }>({
        from: "logins",
        where: entityEqual("actorId", actorId),
        select: { id: { field: "id" } },
      });
      for (const login of logins) await this.deleteSessions(tx, login.id);
    });
  }

  private async deleteSessions(
    tx: ModuleTransaction,
    loginId: string,
    except?: string,
  ): Promise<void> {
    // Bounded batches avoid loading every session into memory during revocation.
    const where = entityAnd(
      entityEqual("loginId", loginId),
      ...(except ? [{ op: "ne" as const, left: { field: "id" }, right: { value: except } }] : []),
    );
    for (;;) {
      const rows = await tx.query<{ id: string }>({
        from: "sessions",
        where,
        select: { id: { field: "id" } },
        limit: 100,
      });
      if (!rows.length) break;
      for (const row of rows) await tx.delete("sessions", row.id);
    }
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
    return { ...identity, login };
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

function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 1024)
    throw invalidInput("Use a password of 12 to 1024 characters.");
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
