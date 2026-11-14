// limit-requests: a rate limit per client and a deadline per request. The check starts serve.ts
// from your folder the way a host would, then sends one client too many requests.
import { resolve } from "node:path";
import { DEMO, mintToken } from "../world/auth";
import { failed, rule, scenario } from "./lib/rules";
import { freshWorld } from "./lib/world";

const PUBLIC_URL = "https://harrow-lane.example.net/mcp";
const READY_TIMEOUT_MS = 10000;
const BURST_SIZE = 80; // more requests than one client may make in a minute

type Target = { socketUrl: string };
type StaffRow = { id: string; role: string; site: string };

const world = freshWorld();

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port as number;
  probe.stop(true);
  return port;
}

/** Sends one request, with the Host header of the public address. */
function send(target: Target, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("host", new URL(PUBLIC_URL).host);
  return fetch(new URL(path, target.socketUrl), { ...init, headers });
}

async function waitUntilAnswering(target: Target): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await send(target, "/").catch(() => undefined)) return true;
    await Bun.sleep(200);
  }
  return false;
}

function tokenFor(staffId: string): Promise<string> {
  const [staff] = world.rows<StaffRow>("SELECT id, role, site FROM staff WHERE id = ?", staffId);
  return mintToken({
    staffId: staff.id,
    role: staff.role,
    site: staff.site,
    audience: PUBLIC_URL,
  });
}

const listToolsBody = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

async function listTools(target: Target, token: string): Promise<Response> {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
  };
  const answer = await send(target, new URL(PUBLIC_URL).pathname, {
    method: "POST",
    headers,
    body: listToolsBody,
  });
  await answer.text();
  return answer;
}

/** Starts the server with these settings, lets `act` talk to it, and always stops it. */
async function rehearse<Result>(
  dir: string,
  extra: Record<string, string>,
  act: (target: Target) => Promise<Result>,
): Promise<Result | { answering: false }> {
  const port = freePort();
  const target = { socketUrl: `http://127.0.0.1:${port}/` };
  // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
  const settings = { PORT: String(port), PUBLIC_URL, ...extra };
  const server = Bun.spawn([process.execPath, "serve.ts"], {
    cwd: resolve(dir),
    env: { ...(process.env as Record<string, string>), ...world.env, ...settings },
    stdout: "ignore",
    stderr: "ignore",
  });
  try {
    if (!(await waitUntilAnswering(target))) return { answering: false };
    return await act(target);
  } finally {
    server.kill();
    await server.exited;
  }
}

const limitRun = scenario((dir) =>
  rehearse(dir, {}, async (target) => {
    const joon = await tokenFor(DEMO.joon);
    let limited = 0;
    let retryAfter = "";
    for (let sent = 0; sent < BURST_SIZE; sent++) {
      const answer = await listTools(target, joon);
      if (answer.status !== 429) continue;
      limited += 1;
      retryAfter ||= answer.headers.get("retry-after") ?? "";
    }
    const ola = await listTools(target, await tokenFor(DEMO.ola));
    return { answering: true as const, limited, retryAfter, olaStatus: ola.status };
  }),
);

/** With a deadline of zero, no request can finish in time, so the server must answer 504. */
const deadlineRun = scenario((dir) =>
  // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
  rehearse(dir, { REQUEST_TIMEOUT_MS: "0" }, async (target) => {
    const answer = await listTools(target, await tokenFor(DEMO.joon));
    return {
      answering: true as const,
      status: answer.status,
      retryAfter: answer.headers.get("retry-after"),
    };
  }),
);

/** A normal run must still work: with the default deadline, a request is answered. */
const normalRun = scenario((dir) =>
  rehearse(dir, {}, async (target) => {
    const answer = await listTools(target, await tokenFor(DEMO.joon));
    return { answering: true as const, status: answer.status };
  }),
);

const ok = (seen: unknown): seen is { answering: true } =>
  !failed(seen) && (seen as { answering: boolean }).answering === true;

export default [
  rule(
    "The server still answers a normal request with the default deadline",
    async (dir) => {
      const seen = await normalRun(dir);
      return ok(seen) && (seen as { status: number }).status === 200;
    },
    "keep serve.ts and app.ts working: read PORT and PUBLIC_URL, default the deadline to 15000",
  ),
  rule(
    "A client that sends too many requests gets 429 and a Retry-After header in seconds",
    async (dir) => {
      const seen = await limitRun(dir);
      if (!ok(seen)) return false;
      const result = seen as { limited: number; retryAfter: string };
      return result.limited > 0 && Number(result.retryAfter) > 0;
    },
    "count requests per client, and answer 429 with Retry-After once a client is over its limit",
  ),
  rule(
    "The limit is per client: Ola is still served after Joon is limited",
    async (dir) => {
      const seen = await limitRun(dir);
      if (!ok(seen)) return false;
      const result = seen as { limited: number; olaStatus: number };
      return result.limited > 0 && result.olaStatus === 200;
    },
    "key the count by the token's subject (authInfo.clientId), not one counter for everyone",
  ),
  rule(
    "A request that runs past the deadline gets 504 and a Retry-After header",
    async (dir) => {
      const seen = await deadlineRun(dir);
      if (!ok(seen)) return false;
      const result = seen as { status: number; retryAfter: string | null };
      return result.status === 504 && Boolean(result.retryAfter);
    },
    "read REQUEST_TIMEOUT_MS, race the handler against it, and answer 504 with Retry-After",
  ),
];
