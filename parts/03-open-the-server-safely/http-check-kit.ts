// Helpers the Part 03 checks share. They start the learner's HTTP server on a free port against a
// fresh world, talk to it over real HTTP, and always stop it at the end.
// The checks never import the learner's code, so any server that speaks MCP over HTTP passes.
import { resolve } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { freshWorld, type World } from "../../checks/lib/world";
import { mintToken, type TokenRequest } from "../../world/auth";

export const MODERN_VERSION = "2026-07-28";
export const LEGACY_VERSION = "2025-11-25";
const START_TIMEOUT_MS = 10000;

export type HttpSession = { url: string; port: number; world: World; stderr: () => string };
export type RawAnswer = {
  status: number;
  headers: Headers;
  body: { result?: Record<string, unknown>; error?: { code: number; message: string } };
};
export type RawRequest = {
  method: string;
  params?: Record<string, unknown>;
  token?: string;
  host?: string;
  era?: "modern" | "legacy";
  query?: string;
};

// The demo staff the checks act as.
export const STAFF: Record<string, Omit<TokenRequest, "audience">> = {
  ola: { staffId: "S-08", role: "receptionist", site: "millbrook" },
  sam: { staffId: "S-05", role: "vet", site: "millbrook" },
  joon: { staffId: "S-01", role: "director", site: "harrow-lane" },
};

function freePort(): number {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
  const port = probe.port ?? 0;
  probe.stop(true);
  return port;
}

async function collectText(stream: ReadableStream<Uint8Array>, collected: { text: string }) {
  const decoder = new TextDecoder();
  for await (const chunk of stream) collected.text += decoder.decode(chunk);
}

// Waits until the server answers any HTTP request, or the process ends, or time runs out.
async function waitUntilListening(url: string, server: Bun.Subprocess, stderr: { text: string }) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`"bun http.ts" stopped before it listened. It said: ${stderr.text.trim()}`);
    }
    const answered = await fetch(url, { method: "GET" }).then(
      () => true,
      () => false,
    );
    if (answered) return;
    await Bun.sleep(100);
  }
  throw new Error(`nothing answered on ${url} within 10 seconds. Does http.ts read MCP_PORT?`);
}

/** Start `bun http.ts` in `dir` on a free port with a fresh world, run `use`, then stop it. */
export async function withHttpServer<Result>(
  dir: string,
  use: (session: HttpSession) => Promise<Result>,
): Promise<Result> {
  const world = freshWorld();
  const port = freePort();
  const url = `http://127.0.0.1:${port}/mcp`;
  const server = Bun.spawn([process.execPath, "http.ts"], {
    cwd: resolve(dir),
    // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
    env: { ...(process.env as Record<string, string>), ...world.env, MCP_PORT: String(port) },
    stdout: "ignore",
    stderr: "pipe",
  });
  const stderr = { text: "" };
  collectText(server.stderr, stderr);
  try {
    await waitUntilListening(url, server, stderr);
    return await use({ url, port, world, stderr: () => stderr.text });
  } finally {
    server.kill();
    await server.exited;
  }
}

/** A token for one of the demo staff, made for this server's URL unless `changes` say otherwise. */
export function tokenFor(who: string, url: string, changes: Partial<TokenRequest> = {}) {
  return mintToken({ ...STAFF[who], audience: url, ...changes });
}

function requestHeaders(request: RawRequest, url: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    host: request.host ?? new URL(url).host,
  };
  if (request.token) headers.authorization = `Bearer ${request.token}`;
  if (request.era !== "legacy") {
    headers["mcp-method"] = request.method;
    headers["mcp-protocol-version"] = MODERN_VERSION;
    const name = request.params?.name;
    if (typeof name === "string") headers["mcp-name"] = name;
  }
  return headers;
}

// A 2026-07-28 request carries the protocol version and client details in _meta.
function requestBody(request: RawRequest): string {
  const params = { ...request.params };
  if (request.era !== "legacy") {
    params._meta = {
      "io.modelcontextprotocol/protocolVersion": MODERN_VERSION,
      "io.modelcontextprotocol/clientInfo": { name: "harrow-lane-check", version: "1.0.0" },
      "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
    };
  }
  return JSON.stringify({ jsonrpc: "2.0", id: 1, method: request.method, params });
}

// A reply is plain JSON, or a stream of server-sent events whose last data line is the answer.
function parseBody(text: string, contentType: string): RawAnswer["body"] {
  if (!text) return {};
  if (!contentType.includes("text/event-stream")) return JSON.parse(text);
  const dataLines = text.split("\n").filter((line) => line.startsWith("data:"));
  const lastLine = dataLines.at(-1);
  if (!lastLine) return {};
  return JSON.parse(lastLine.slice("data:".length));
}

/** One JSON-RPC request over plain HTTP, so a check can set any header it wants. */
export async function rawCall(url: string, request: RawRequest): Promise<RawAnswer> {
  const target = request.query ? `${url}?${request.query}` : url;
  const response = await fetch(target, {
    method: "POST",
    headers: requestHeaders(request, url),
    body: requestBody(request),
  });
  const text = await response.text();
  let body: RawAnswer["body"] = {};
  try {
    body = parseBody(text, response.headers.get("content-type") ?? "");
  } catch {
    body = {};
  }
  return { status: response.status, headers: response.headers, body };
}

/** The real MCP client over HTTP, answering every confirmation with `confirm`. */
export async function connectClient(
  url: string,
  options: { token?: string; confirm?: boolean } = {},
): Promise<Client> {
  const client = new Client(
    { name: "harrow-lane-check", version: "1.0.0" },
    { capabilities: { elicitation: {} }, versionNegotiation: { mode: "auto" } },
  );
  client.setRequestHandler("elicitation/create", async () => ({
    action: "accept",
    content: { confirm: options.confirm ?? true },
  }));
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }),
  );
  return client;
}

/** The text of a tool result, joined into one string. */
export function textOf(result: Record<string, unknown> | undefined): string {
  const content = (result?.content ?? []) as { type: string; text?: string }[];
  const textParts = content.filter((part) => part.type === "text").map((part) => part.text);
  return textParts.join("\n");
}

/** The names of the tools in a tools/list result. */
export function toolNames(result: Record<string, unknown> | undefined): string[] {
  const tools = (result?.tools ?? []) as { name: string }[];
  return tools.map((tool) => tool.name);
}
