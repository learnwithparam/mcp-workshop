// Start the learner's server the way a real host would and talk to it as an MCP client.
// The checker never imports the learner's code, so any language or framework that speaks MCP passes.
import type { Client } from "@modelcontextprotocol/client";
import { connectFolder, type Confirm } from "../../world/connect";
import { freshWorld, type World } from "./world";

export type Session = { client: Client; world: World; stderr: () => string };
export type ToolResult = { isError: boolean; text: string; structured?: any; thrown?: string };

/** Spawn the server in `dir` against a fresh world, run `fn`, and always stop the server. */
export async function withServer<T>(dir: string, fn: (s: Session) => Promise<T>, opts: { confirm?: Confirm; launch?: { command: string; args: string[] } } = {}): Promise<T> {
  const world = freshWorld();
  const conn = await connectFolder(dir, { env: world.env, confirm: opts.confirm, launch: opts.launch });
  try {
    return await fn({ client: conn.client, world, stderr: conn.stderr });
  } finally {
    await conn.close().catch(() => {});
  }
}

/** Call a tool and flatten the answer. A protocol error is caught and reported, not thrown. */
export async function call(client: Client, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { type: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    return { isError: Boolean(r.isError), text, structured: r.structuredContent };
  } catch (e) {
    return { isError: true, text: "", thrown: (e as Error).message };
  }
}

/** tools/list, or an empty list when the server has no tools capability yet (a fresh starter). */
export async function listTools(client: Client) {
  return client.getServerCapabilities()?.tools ? client.listTools() : { tools: [] as Awaited<ReturnType<Client["listTools"]>>["tools"] };
}

/** Times written as HH:MM in a piece of text. */
export const timesIn = (text: string) => [...text.matchAll(/\b([01]\d|2[0-3]):[0-5]\d\b/g)].map((m) => m[0]);

/**
 * Start the server raw, send nothing, and collect what it writes to stdout before any request arrives.
 * A stdio server must write only protocol messages there, and it has nothing to answer yet.
 */
export async function stdoutBeforeAnyRequest(dir: string, env: Record<string, string>): Promise<string> {
  const { launchFor } = await import("../../world/connect");
  const { resolve } = await import("node:path");
  const launch = launchFor(resolve(dir));
  const proc = Bun.spawn([launch.command === "bun" ? process.execPath : launch.command, ...launch.args], {
    cwd: resolve(dir), env: { ...(process.env as Record<string, string>), ...env }, stdin: "pipe", stdout: "pipe", stderr: "pipe",
  });
  let out = "";
  const dec = new TextDecoder();
  const readOut = (async () => { for await (const c of proc.stdout) out += dec.decode(c); })();
  const firstErr = (async () => { for await (const _ of proc.stderr) return; })();
  await Promise.race([firstErr, Bun.sleep(1500)]);
  await Bun.sleep(150);
  proc.kill();
  await Promise.race([readOut, Bun.sleep(200)]);
  return out;
}
