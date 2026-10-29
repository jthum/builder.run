import { SERVER_MODE } from "$lib/app/deployment.ts";
import { serverRequest } from "$lib/app/remote.ts";
import { ERROR_CODES, FrameworkError } from "@jthum/framework/errors";

export interface AssistantSettings {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
}

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = Object.freeze({
  baseUrl: "https://api.openai.com/v1",
  model: "",
  apiKey: "",
});

const DATABASE = "builder-run-assistant";
const STORE = "settings";
const KEY = "provider";

export async function loadAssistantSettings(): Promise<AssistantSettings> {
  if (SERVER_MODE && typeof window !== "undefined")
    return (await serverRequest("assistant.get")) as AssistantSettings;
  if (typeof indexedDB === "undefined") return { ...DEFAULT_ASSISTANT_SETTINGS };
  const database = await openSettingsDatabase();
  try {
    const stored = await request<unknown>(database.transaction(STORE).objectStore(STORE).get(KEY));
    return readAssistantSettings(stored);
  } finally {
    database.close();
  }
}

export async function saveAssistantSettings(input: AssistantSettings): Promise<void> {
  const settings = readAssistantSettings(input);
  if (SERVER_MODE && typeof window !== "undefined") {
    await serverRequest("assistant.put", { ...settings });
    return;
  }
  if (typeof indexedDB === "undefined")
    throw new FrameworkError({
      code: ERROR_CODES.environmentCapabilityUnavailable,
      message: "Browser storage is unavailable. Assistant settings could not be saved.",
    });
  const database = await openSettingsDatabase();
  try {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(settings, KEY);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export function assistantConfigured(settings: AssistantSettings): boolean {
  return Boolean(settings.baseUrl.trim() && settings.model.trim());
}

function readAssistantSettings(value: unknown): AssistantSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ...DEFAULT_ASSISTANT_SETTINGS };
  const candidate = value as Partial<AssistantSettings>;
  return {
    baseUrl:
      typeof candidate.baseUrl === "string" && candidate.baseUrl.trim()
        ? candidate.baseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_ASSISTANT_SETTINGS.baseUrl,
    model: typeof candidate.model === "string" ? candidate.model.trim() : "",
    apiKey: typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : "",
  };
}

function openSettingsDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 1);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE)) opening.result.createObjectStore(STORE);
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () =>
      reject(opening.error ?? new Error("Could not open assistant settings."));
  });
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error("Assistant settings failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Assistant settings aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Assistant settings failed."));
  });
}
