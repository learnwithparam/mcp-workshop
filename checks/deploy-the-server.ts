// deploy-the-server: the Part 3 promises, checked over the network against a deployed server.
//   bun run verify deploy-the-server --url https://your-server.example/mcp   your live server
//   bun run verify deploy-the-server                                         a deploy rehearsal
// A rehearsal starts the CMD from your Dockerfile the way a host would: with its own PORT and
// PUBLIC_URL, and with requests that name a public host. Tokens are minted for the address under
// test, so a server that still thinks it lives at 127.0.0.1:8787 refuses them.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { DEMO, mintToken } from "../world/auth";
import { failed, rule, scenario } from "./lib/rules";
import { freshWorld } from "./lib/world";

const ROOT = join(import.meta.dir, "..");
const REHEARSAL_URL = "https://harrow-lane.example.net/mcp";
const OTHER_SERVER = "https://lab-results.harrowlane.test";
const READY_TIMEOUT_MS = 10000;

type Target = { publicUrl: string; socketUrl: string };
type Launch = { command: string; args: string[] };
type StaffRow = { id: string; role: string; site: string };

/** The URL given after --url on the command line, if any. */
function urlFromCommandLine(): string | undefined {
  const position = process.argv.indexOf("--url");
  if (position < 0) return undefined;
  return process.argv[position + 1];
}

/** The CMD of the Dockerfile in the folder, in its JSON form: CMD ["bun", "path/serve.ts"]. */
function dockerCommand(dir: string): Launch | undefined {
  const dockerfile = join(dir, "Dockerfile");
  if (!existsSync(dockerfile)) return undefined;
  const text = readFileSync(dockerfile, "utf8");
  const cmdLine = text.match(/^CMD\s+(\[.*\])\s*$/m)?.[1];
  if (!cmdLine || !/^FROM\s+\S+/m.test(text)) return undefined;
  const [command, ...args] = JSON.parse(cmdLine) as string[];
  if (!command) return undefined;
  return { command, args };
}

/** The image keeps the repo layout, so the script in CMD must exist from the repo root. */
function dockerfileIsComplete(dir: string): boolean {
  const launch = dockerCommand(dir);
  if (!launch) return false;
  const script = launch.args.find((arg) => /\.(ts|js)$/.test(arg));
  return Boolean(script && existsSync(join(ROOT, script)));
}

/** How a rehearsal starts the server: the Dockerfile CMD, or `bun serve.ts` when there is none. */
function rehearsalLaunch(dir: string): { launch: Launch; cwd: string } {
  if (dockerfileIsComplete(dir)) return { launch: dockerCommand(dir) as Launch, cwd: ROOT };
  return { launch: { command: "bun", args: ["serve.ts"] }, cwd: resolve(dir) };
}

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port as number;
  probe.stop(true);
  return port;
}

/** Sends one request to the server, with the Host header of the public address. */
function send(target: Target, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("host", new URL(target.publicUrl).host);
  return fetch(new URL(path, target.socketUrl), { ...init, headers });
}

async function waitUntilAnswering(target: Target): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const answer = await send(target, "/").catch(() => undefined);
    if (answer) return true;
    await Bun.sleep(200);
  }
  return false;
}

const world = freshWorld();

/** A token for one of the demo staff, minted for the address under test (or another one). */
function tokenFor(staffId: string, audience: string): Promise<string> {
  const [staff] = world.rows<StaffRow>("SELECT id, role, site FROM staff WHERE id = ?", staffId);
  return mintToken({ staffId: staff.id, role: staff.role, site: staff.site, audience });
}

/** An MCP client that talks to the server with this token. */
async function connectAs(target: Target, token: string): Promise<Client> {
  const client = new Client(
    { name: "harrow-lane-deploy-check", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  const mcpPath = new URL(target.publicUrl).pathname;
  const transport = new StreamableHTTPClientTransport(new URL(mcpPath, target.socketUrl), {
    fetch: (url, init) => send(target, new URL(String(url)).pathname, init),
    // biome-ignore lint/style/useNamingConvention: HTTP header names are fixed by the standard
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

type TokenView = { names: string[]; readNotesRefused: boolean };

/** What a token sees. A server that refuses the connection shows it no tools at all. */
function whatTokenSees(target: Target, token: string): Promise<TokenView> {
  return toolsAndNotesCall(target, token).catch(() => ({ names: [], readNotesRefused: false }));
}

/** The tool names this token sees, and whether a direct read_notes call was refused. */
async function toolsAndNotesCall(target: Target, token: string): Promise<TokenView> {
  const client = await connectAs(target, token);
  try {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    const notesCall = await client
      .callTool({ name: "read_notes", arguments: { patientId: "P-0001" } })
      .catch(() => ({ isError: true }));
    return { names, readNotesRefused: Boolean(notesCall.isError) };
  } finally {
    await client.close().catch(() => {});
  }
}

const listToolsBody = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

function postWithToken(target: Target, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return send(target, new URL(target.publicUrl).pathname, {
    method: "POST",
    headers,
    body: listToolsBody,
  });
}

/** The resource named by the metadata document that the 401 challenge points to. */
async function metadataResource(target: Target, challenge: string): Promise<string> {
  const metadataUrl = challenge.match(/resource_metadata="([^"]+)"/)?.[1];
  if (!metadataUrl) return "";
  const answer = await send(target, new URL(metadataUrl).pathname);
  const metadata = (await answer.json().catch(() => ({}))) as { resource?: string };
  return metadata.resource ?? "";
}

/** Every request the rules judge, made once against a server that is already answering. */
async function probe(target: Target) {
  const noToken = await postWithToken(target);
  const challenge = noToken.headers.get("www-authenticate") ?? "";
  const otherAudience = await postWithToken(target, await tokenFor(DEMO.joon, OTHER_SERVER));
  return {
    answering: true,
    noTokenStatus: noToken.status,
    challenge,
    resource: await metadataResource(target, challenge),
    otherAudienceStatus: otherAudience.status,
    joon: await whatTokenSees(target, await tokenFor(DEMO.joon, target.publicUrl)),
    ola: await whatTokenSees(target, await tokenFor(DEMO.ola, target.publicUrl)),
  };
}

type Probe = Awaited<ReturnType<typeof probe>>;

/** Starts the server like a host would, probes it, and always stops it. */
async function rehearse(dir: string): Promise<Probe | { answering: false }> {
  const port = freePort();
  const target = { publicUrl: REHEARSAL_URL, socketUrl: `http://127.0.0.1:${port}/` };
  const { launch, cwd } = rehearsalLaunch(dir);
  const command = launch.command === "bun" ? process.execPath : launch.command;
  // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
  const settings = { PORT: String(port), PUBLIC_URL: REHEARSAL_URL };
  const server = Bun.spawn([command, ...launch.args], {
    cwd,
    env: { ...(process.env as Record<string, string>), ...world.env, ...settings },
    stdout: "ignore",
    stderr: "ignore",
  });
  try {
    if (!(await waitUntilAnswering(target))) return { answering: false };
    return await probe(target);
  } finally {
    server.kill();
    await server.exited;
  }
}

const run = scenario(async (dir) => {
  const deployedUrl = urlFromCommandLine();
  if (!deployedUrl) return rehearse(dir);
  const target = { publicUrl: deployedUrl, socketUrl: new URL("/", deployedUrl).href };
  if (!(await waitUntilAnswering(target))) return { answering: false as const };
  return probe(target);
});

/** Runs the scenario and hands its result to `judge`, or fails when the server never answered. */
async function judged(dir: string, judge: (seen: Probe) => boolean): Promise<boolean> {
  const seen = await run(dir);
  if (failed(seen) || !seen.answering) return false;
  return judge(seen);
}

const where = () => urlFromCommandLine() ?? `the rehearsal address ${REHEARSAL_URL}`;

export default [
  rule(
    "The Dockerfile has FROM and a CMD whose script exists from the repo root",
    async (dir) => dockerfileIsComplete(dir),
    'add a Dockerfile with FROM oven/bun and CMD ["bun", "<path from the repo root>/serve.ts"]',
  ),
  rule(
    "The server answers on the port the host gives it in PORT",
    async (dir) => {
      const seen = await run(dir);
      return !failed(seen) && seen.answering;
    },
    "read the port from process.env.PORT in serve.ts, and listen on 0.0.0.0",
  ),
  rule(
    "A request with no token gets 401 and a WWW-Authenticate header with the metadata URL",
    (dir) =>
      judged(
        dir,
        (seen) => seen.noTokenStatus === 401 && seen.challenge.includes("resource_metadata="),
      ),
    () =>
      `a 403 means the Host check refused ${where()}: ` +
      "add the hostname of PUBLIC_URL to the allowed hostnames",
  ),
  rule(
    "The metadata names the public address as the resource",
    (dir) => judged(dir, (seen) => seen.resource === (urlFromCommandLine() ?? REHEARSAL_URL)),
    "build the resource URL from process.env.PUBLIC_URL, not from 127.0.0.1:8787",
  ),
  rule(
    "Joon's token for the public address lists the tools",
    (dir) => judged(dir, (seen) => seen.joon.names.includes("find_free_slots")),
    "tokens are minted for PUBLIC_URL: use it as the expected resource and the token audience",
  ),
  rule(
    "A token minted for another server gets 401",
    (dir) => judged(dir, (seen) => seen.otherAudienceStatus === 401),
    `accept a token only when its audience is exactly PUBLIC_URL, never ${OTHER_SERVER}`,
  ),
  rule(
    "Ola's token sees no read_notes, and a direct read_notes call is refused",
    (dir) =>
      judged(dir, (seen) => !seen.ola.names.includes("read_notes") && seen.ola.readNotesRefused),
    "register read_notes only for tokens with the notes:read scope",
  ),
];
