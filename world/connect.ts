// Connect an MCP client to a server. It is either the finished one (in this process, over
// Streamable HTTP with a token) or a learner's server in a folder (started over stdio).
// Used by `bun run try`, `bun run ask` and the checks.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { clinic } from "#clinic";
import { DEMO, mintToken, RESOURCE } from "./auth";

export type Confirm = "yes" | "no" | "decline";
export type Connected = { client: Client; stderr: () => string; close: () => Promise<void> };
type Launch = { command: string; args: string[] };

const CONNECT_TIMEOUT_MS = 15000;

// The client answers every confirmation the server asks for in the same way.
function newClient(confirm: Confirm) {
  const client = new Client(
    { name: "harrow-lane-course", version: "1.0.0" },
    { capabilities: { elicitation: {} }, versionNegotiation: { mode: "auto" } },
  );
  client.setRequestHandler("elicitation/create", async () => {
    if (confirm === "decline") return { action: "decline" };
    return { action: "accept", content: { confirm: confirm === "yes" } };
  });
  return client;
}

export async function tokenFor(who: string) {
  const staffId = (DEMO as Record<string, string>)[who] ?? who;
  const staffMember = clinic.staffMember(staffId);
  if (!staffMember) throw new Error(`No staff member called "${who}". Use ola, sam or joon.`);
  return mintToken({ staffId: staffMember.id, role: staffMember.role, site: staffMember.site });
}

/** The finished server, served in this process: no port, no second terminal. */
export async function connectFinished(
  options: { as?: string; token?: string; confirm?: Confirm } = {},
): Promise<Connected> {
  const { app } = await import("./finished/app");
  const token = options.token ?? (await tokenFor(options.as ?? "ola"));
  const client = newClient(options.confirm ?? "yes");
  const transport = new StreamableHTTPClientTransport(new URL(RESOURCE), {
    fetch: (url, init) => {
      const request = new Request(url, init);
      // A real socket sets the Host header; a call inside this process must set it itself.
      request.headers.set("host", new URL(request.url).host);
      return app.fetch(request);
    },
    // biome-ignore lint/style/useNamingConvention: HTTP header names are fixed by the standard
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return { client, stderr: () => "", close: () => client.close() };
}

/** How to start the server in a folder: launch.json if it has one, else `bun server.ts`. */
export function launchFor(folder: string): Launch {
  const launchFile = join(folder, "launch.json");
  if (existsSync(launchFile)) return JSON.parse(readFileSync(launchFile, "utf8"));
  return { command: process.execPath, args: ["server.ts"] };
}

/** A server in a folder, started over stdio the way Claude Code or Claude Desktop starts it. */
export async function connectFolder(
  folder: string,
  options: { env?: Record<string, string>; confirm?: Confirm; launch?: Launch } = {},
): Promise<Connected> {
  const absoluteFolder = resolve(folder);
  const launch = options.launch ?? launchFor(absoluteFolder);
  const command = launch.command === "bun" ? process.execPath : launch.command;
  const client = newClient(options.confirm ?? "yes");
  const transport = new StdioClientTransport({
    command,
    args: launch.args,
    cwd: absoluteFolder,
    env: { ...(process.env as Record<string, string>), ...options.env },
    stderr: "pipe",
  });
  let serverOutput = "";
  transport.stderr?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });
  try {
    await Promise.race([client.connect(transport), timeoutAfter(CONNECT_TIMEOUT_MS)]);
  } catch (error) {
    await transport.close().catch(() => {});
    const message = `${(error as Error).message}${lastLinesOf(serverOutput)}`;
    throw Object.assign(new Error(message), { stderr: serverOutput });
  }
  return { client, stderr: () => serverOutput, close: () => client.close() };
}

function timeoutAfter(milliseconds: number): Promise<never> {
  return new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("the server did not answer within 15 seconds")),
      milliseconds,
    ),
  );
}

// The last three lines a server printed usually say why it failed to start.
function lastLinesOf(serverOutput: string): string {
  if (!serverOutput) return "";
  const lines = serverOutput.trim().split("\n");
  return ` Server said: ${lines.slice(-3).join(" | ")}`;
}
