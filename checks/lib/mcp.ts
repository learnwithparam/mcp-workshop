// Start the learner's server the way a real host would and talk to it as an MCP client.
// The checker never imports the learner's code, so any language or framework that speaks MCP
// passes.
import type { Client } from "@modelcontextprotocol/client";
import { type Confirm, connectFolder } from "../../world/connect";
import { freshWorld, type World } from "./world";

export type Session = { client: Client; world: World; stderr: () => string };
export type ToolResult = {
  isError: boolean;
  text: string;
  structured?: unknown;
  thrown?: string;
};

type ServerOptions = { confirm?: Confirm; launch?: { command: string; args: string[] } };

/** Spawn the server in `dir` against a fresh world, run `useServer`, and always stop the server. */
export async function withServer<Result>(
  dir: string,
  useServer: (session: Session) => Promise<Result>,
  options: ServerOptions = {},
): Promise<Result> {
  const world = freshWorld();
  const connection = await connectFolder(dir, {
    env: world.env,
    confirm: options.confirm,
    launch: options.launch,
  });
  try {
    return await useServer({ client: connection.client, world, stderr: connection.stderr });
  } finally {
    await connection.close().catch(() => {});
  }
}

/** Call a tool and flatten the answer. A protocol error is caught and reported, not thrown. */
export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text?: string }[];
    const textParts = content.filter((part) => part.type === "text").map((part) => part.text);
    return {
      isError: Boolean(result.isError),
      text: textParts.join("\n"),
      structured: result.structuredContent,
    };
  } catch (error) {
    return { isError: true, text: "", thrown: (error as Error).message };
  }
}

type ToolList = Awaited<ReturnType<Client["listTools"]>>;

/** tools/list, or an empty list when the server has no tools capability yet (a fresh starter). */
export async function listTools(client: Client): Promise<ToolList | { tools: ToolList["tools"] }> {
  if (client.getServerCapabilities()?.tools) return client.listTools();
  return { tools: [] };
}

/** Times written as HH:MM in a piece of text. */
export const timesIn = (text: string) => {
  const matches = text.matchAll(/\b([01]\d|2[0-3]):[0-5]\d\b/g);
  return [...matches].map((match) => match[0]);
};

/** Collects everything the process writes to stdout, as text. */
async function collectText(stream: ReadableStream<Uint8Array>, collected: { text: string }) {
  const decoder = new TextDecoder();
  for await (const chunk of stream) collected.text += decoder.decode(chunk);
}

/** Resolves when the process first writes to stderr, which a server does once it is up. */
async function firstStderrOutput(stream: ReadableStream<Uint8Array>) {
  for await (const _chunk of stream) return;
}

/**
 * Start the server raw, send nothing, and collect what it writes to stdout before any request
 * arrives. A stdio server must write only protocol messages there, and it has nothing to answer
 * yet.
 */
export async function stdoutBeforeAnyRequest(
  dir: string,
  env: Record<string, string>,
): Promise<string> {
  const { launchFor } = await import("../../world/connect");
  const { resolve } = await import("node:path");
  const launch = launchFor(resolve(dir));
  // Run Bun scripts with this same Bun, so the check does not depend on what is on the PATH.
  const command = launch.command === "bun" ? process.execPath : launch.command;
  const server = Bun.spawn([command, ...launch.args], {
    cwd: resolve(dir),
    env: { ...(process.env as Record<string, string>), ...env },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = { text: "" };
  const reading = collectText(server.stdout, stdout);
  // Wait until the server says something on stderr (or 1.5 seconds), then a little longer.
  await Promise.race([firstStderrOutput(server.stderr), Bun.sleep(1500)]);
  await Bun.sleep(150);
  server.kill();
  await Promise.race([reading, Bun.sleep(200)]);
  return stdout.text;
}
