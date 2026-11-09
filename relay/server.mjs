#!/usr/bin/env node
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createSpacefastRelay } from "./spacefast.mjs";

/** @param {(request:Request)=>Promise<Response>} handler */
export function createRelayServer(handler) {
  return createServer(async (incoming, outgoing) => {
    if (incoming.url !== "/") {
      outgoing.writeHead(404).end();
      return;
    }
    const controller = new AbortController();
    incoming.once("aborted", () => controller.abort());
    outgoing.once("close", () => {
      if (!outgoing.writableFinished) controller.abort();
    });
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers))
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      const method = /** @type {string} */ (incoming.method);
      const body = ["GET", "HEAD"].includes(method)
        ? undefined
        : /** @type {ReadableStream<Uint8Array>} */ (
            /** @type {unknown} */ (Readable.toWeb(incoming))
          );
      const options = {
        method,
        headers,
        body,
        duplex: "half",
        signal: controller.signal,
      };
      const request = new Request("http://relay.local/", options);
      const response = await handler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body)
        await pipeline(
          Readable.fromWeb(
            /** @type {import("node:stream/web").ReadableStream} */ (
              /** @type {unknown} */ (response.body)
            ),
          ),
          outgoing,
        );
      else outgoing.end();
    } catch {
      if (!outgoing.headersSent)
        outgoing
          .writeHead(502, { "content-type": "application/json", "cache-control": "no-store" })
          .end(
            JSON.stringify({
              error: { code: "RELAY.CONNECTION_FAILED", message: "The relay connection failed." },
            }),
          );
      else outgoing.destroy();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      origin: { type: "string", multiple: true },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: process.env.PORT ?? "8788" },
      help: { type: "boolean" },
    },
  });
  const help =
    "Usage: node server.mjs --origin https://builder.run [--origin http://localhost:5173] [--host 127.0.0.1] [--port 8788]";
  if (values.help) console.log(help);
  else {
    if (!values.origin?.length) throw new Error(help);
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port.");
    const server = createRelayServer(createSpacefastRelay({ origins: values.origin }));
    server.requestTimeout = 120000;
    server.headersTimeout = 10000;
    server.listen(port, values.host, () =>
      console.log(
        `Spacefast relay listening on ${values.host}:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`,
      ),
    );
    const stop = () => {
      server.close();
      server.closeIdleConnections();
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  }
}
