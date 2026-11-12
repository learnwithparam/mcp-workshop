// Connect an MCP client to a server: the finished one (in this process, over Streamable HTTP with a token),
// or a learner's server in a folder (spawned over stdio). Used by `bun run try`, `bun run ask` and the checks.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { clinic } from "#clinic";
import { DEMO, mintToken, RESOURCE } from "./auth";

export type Confirm = "yes" | "no" | "decline";
export type Connected = { client: Client; stderr: () => string; close: () => Promise<void> };

function newClient(confirm: Confirm) {
  const client = new Client(
    { name: "harrow-lane-course", version: "1.0.0" },
    { capabilities: { elicitation: {} }, versionNegotiation: { mode: "auto" } },
  );
  client.setRequestHandler("elicitation/create", async () =>
    confirm === "decline"
      ? { action: "decline" }
      : { action: "accept", content: { confirm: confirm === "yes" } },
  );
  return client;
}

export async function tokenFor(who: string) {
  const id = (DEMO as Record<string, string>)[who] ?? who;
  const s = clinic.staffMember(id);
  if (!s) throw new Error(`No staff member called "${who}". Use ola, sam or joon.`);
  return mintToken({ staff_id: s.id, role: s.role, site: s.site });
}

/** The finished server, served in this process: no port, no second terminal. */
export async function connectFinished(
  opts: { as?: string; token?: string; confirm?: Confirm } = {},
): Promise<Connected> {
  const { app } = await import("./finished/app");
  const token = opts.token ?? (await tokenFor(opts.as ?? "ola"));
  const client = newClient(opts.confirm ?? "yes");
  const transport = new StreamableHTTPClientTransport(new URL(RESOURCE), {
    fetch: (url, init) => {
      const req = new Request(url, init);
      req.headers.set("host", new URL(req.url).host); // a real socket sets Host; an in-process call must say it
      return app.fetch(req);
    },
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return { client, stderr: () => "", close: () => client.close() };
}

/** How to start the server in a folder: launch.json if it has one, else `bun server.ts`. */
export function launchFor(dir: string): { command: string; args: string[] } {
  const f = join(dir, "launch.json");
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  return { command: process.execPath, args: ["server.ts"] };
}

/** A server in a folder, spawned over stdio the way Claude Code or Claude Desktop would start it. */
export async function connectFolder(
  dir: string,
  opts: {
    env?: Record<string, string>;
    confirm?: Confirm;
    launch?: { command: string; args: string[] };
  } = {},
): Promise<Connected> {
  const abs = resolve(dir);
  const launch = opts.launch ?? launchFor(abs);
  const command = launch.command === "bun" ? process.execPath : launch.command;
  const client = newClient(opts.confirm ?? "yes");
  const transport = new StdioClientTransport({
    command,
    args: launch.args,
    cwd: abs,
    env: { ...(process.env as Record<string, string>), ...opts.env },
    stderr: "pipe",
  });
  let err = "";
  transport.stderr?.on("data", (b: Buffer) => {
    err += b.toString();
  });
  const timeout = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error("the server did not answer within 15 seconds")), 15000),
  );
  try {
    await Promise.race([client.connect(transport), timeout]);
  } catch (e) {
    await transport.close().catch(() => {});
    throw Object.assign(
      new Error(
        `${(e as Error).message}${err ? ` Server said: ${err.trim().split("\n").slice(-3).join(" | ")}` : ""}`,
      ),
      { stderr: err },
    );
  }
  return { client, stderr: () => err, close: () => client.close() };
}
