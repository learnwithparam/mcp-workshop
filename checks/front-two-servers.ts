// front-two-servers: the learner's proxy puts the clinic server and the lab server behind one
// address. The check starts both upstreams, then the proxy, and calls it as Joon. Each upstream
// logs the audience of every token it receives, so the check sees what the proxy sent on.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { DEMO, mintToken } from "../world/auth";
import { call, timesIn } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";
import { freshWorld, type World } from "./lib/world";

const STEP_DIR = join(import.meta.dir, "..", "parts", "05-grow-the-server", "03-front-two-servers");
const UPSTREAMS_DIR = join(STEP_DIR, "upstreams");
const START_TIMEOUT_MS = 15000;

type Process = ReturnType<typeof Bun.spawn>;
type Addresses = { proxy: string; clinic: string; lab: string };
type LoggedToken = { server: string; audience: string | string[] };

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port as number;
  probe.stop(true);
  return port;
}

const addressFor = (port: number) => `http://127.0.0.1:${port}/mcp`;

async function answers(url: string): Promise<boolean> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const reply = await fetch(url, { method: "POST" }).catch(() => undefined);
    if (reply) return true;
    await Bun.sleep(200);
  }
  return false;
}

type Start = { script: string; cwd: string; env: Record<string, string> };

function start({ script, cwd, env }: Start): Process {
  return Bun.spawn([process.execPath, script], {
    cwd,
    env: { ...(process.env as Record<string, string>), ...env },
    stdout: "ignore",
    stderr: "ignore",
  });
}

/** Starts the two upstreams and the learner's proxy. Returns them so they can be stopped. */
async function startEverything(dir: string, world: World, addresses: Addresses) {
  const logPath = join(world.dir, "upstream.log");
  // biome-ignore-start lint/style/useNamingConvention: environment variable names are upper case
  const shared = { ...world.env, UPSTREAM_LOG: logPath };
  const clinicPort = new URL(addresses.clinic).port;
  const labPort = new URL(addresses.lab).port;
  const clinic = start({
    script: "clinic.ts",
    cwd: UPSTREAMS_DIR,
    env: { ...shared, PORT: clinicPort },
  });
  const lab = start({ script: "lab.ts", cwd: UPSTREAMS_DIR, env: { ...shared, PORT: labPort } });
  const running = [clinic, lab];
  if (!(await answers(addresses.clinic)) || !(await answers(addresses.lab)))
    return { running, logPath };
  const proxyEnv = {
    ...world.env,
    PORT: new URL(addresses.proxy).port,
    PUBLIC_URL: addresses.proxy,
    CLINIC_URL: addresses.clinic,
    LAB_URL: addresses.lab,
  };
  // biome-ignore-end lint/style/useNamingConvention: the environment variables end here
  running.push(start({ script: "proxy.ts", cwd: resolve(dir), env: proxyEnv }));
  return { running, logPath };
}

async function connectAsJoon(proxyAddress: string): Promise<Client> {
  const [joon] = freshWorld().rows<{ role: string; site: string }>(
    "SELECT role, site FROM staff WHERE id = ?",
    DEMO.joon,
  );
  const token = await mintToken({ staffId: DEMO.joon, ...joon, audience: proxyAddress });
  const client = new Client(
    { name: "harrow-lane-proxy-check", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  const transport = new StreamableHTTPClientTransport(new URL(proxyAddress), {
    // biome-ignore lint/style/useNamingConvention: HTTP header names are fixed by the standard
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

function loggedTokens(logPath: string): LoggedToken[] {
  if (!existsSync(logPath)) return [];
  const lines = readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line) as LoggedToken);
}

/** Everything the rules judge, seen through the proxy as Joon. */
async function lookThroughProxy(proxyAddress: string) {
  const noToken = await fetch(proxyAddress, { method: "POST", body: "{}" });
  const client = await connectAsJoon(proxyAddress);
  try {
    const { tools } = await client.listTools();
    const slots = await call(client, "clinic_find_free_slots", { site: "millbrook" });
    const order = await call(client, "lab_order_blood_panel", { patientId: "P-0001" });
    return { noTokenStatus: noToken.status, names: tools.map((tool) => tool.name), slots, order };
  } finally {
    await client.close().catch(() => {});
  }
}

const run = scenario(async (dir) => {
  if (!existsSync(join(dir, "proxy.ts"))) throw new Error("there is no proxy.ts in the folder");
  const world = freshWorld();
  const addresses = {
    proxy: addressFor(freePort()),
    clinic: addressFor(freePort()),
    lab: addressFor(freePort()),
  };
  const { running, logPath } = await startEverything(dir, world, addresses);
  try {
    if (!(await answers(addresses.proxy))) throw new Error("the proxy did not start");
    const seen = await lookThroughProxy(addresses.proxy);
    const freeSlots = world.freeSlots({ site: "millbrook", length: 20 });
    const freeStarts = freeSlots.map((slot) => slot.start);
    return { ...seen, addresses, freeStarts, tokens: loggedTokens(logPath) };
  } finally {
    for (const child of running) child.kill();
    await Promise.all(running.map((child) => child.exited));
  }
});

type Seen = Exclude<Awaited<ReturnType<typeof run>>, { failed: string }>;

async function judged(dir: string, judge: (seen: Seen) => boolean): Promise<boolean> {
  const seen = await run(dir);
  return !failed(seen) && judge(seen);
}

let startProblem = "";

/** True when every token this upstream received was minted for its own address, and it got one. */
function onlyOwnAudience(seen: Seen, server: "clinic" | "lab"): boolean {
  const received = seen.tokens.filter((token) => token.server === server);
  const ownAddress = seen.addresses[server];
  const allOwn = received.every((token) => [token.audience].flat().includes(ownAddress));
  return received.length > 0 && allOwn;
}

export default [
  rule(
    "The proxy starts, and refuses a request with no token (401)",
    async (dir) => {
      const seen = await run(dir);
      startProblem = failed(seen) ? seen.failed : "";
      return !failed(seen) && seen.noTokenStatus === 401;
    },
    () =>
      "run the proxy yourself with PORT, PUBLIC_URL, CLINIC_URL and LAB_URL set. " +
      `The checker saw: ${startProblem || "no 401 without a token"}`,
  ),
  rule(
    "Clinic tools have the clinic_ prefix, such as clinic_find_free_slots",
    (dir) => judged(dir, (seen) => seen.names.includes("clinic_find_free_slots")),
    "register each clinic tool as clinic_<name>, so two servers never clash on a name",
  ),
  rule(
    "Pinned lab tools have the lab_ prefix: lab_order_blood_panel and lab_blood_panel_status",
    (dir) =>
      judged(dir, (seen) =>
        ["lab_order_blood_panel", "lab_blood_panel_status"].every((name) =>
          seen.names.includes(name),
        ),
      ),
    "list the lab's tools with a token minted for LAB_URL, and register each as lab_<name>",
  ),
  rule(
    "The unpinned lab tool export_all_results does not appear",
    (dir) => judged(dir, (seen) => !seen.names.some((name) => name.includes("export_all_results"))),
    "keep only the lab tools whose fingerprint is in pins.json",
  ),
  rule(
    "Calls go through: clinic_find_free_slots shows real free slots, lab_order_blood_panel a task",
    (dir) =>
      judged(dir, (seen) => {
        const realSlot = timesIn(seen.slots.text).some((time) => seen.freeStarts.includes(time));
        return realSlot && !seen.order.isError && seen.order.text.includes("LAB-");
      }),
    "an upstream refuses a token minted for the proxy: mint a new token for each upstream call",
  ),
  rule(
    "Each upstream received only tokens minted for its own address",
    (dir) => judged(dir, (seen) => onlyOwnAudience(seen, "clinic") && onlyOwnAudience(seen, "lab")),
    "set the audience of each upstream token to that upstream's URL (CLINIC_URL or LAB_URL)",
  ),
  rule(
    "No upstream ever received a token minted for the proxy",
    (dir) =>
      judged(dir, (seen) => {
        const audiences = seen.tokens.flatMap((token) => [token.audience].flat());
        return seen.tokens.length > 0 && !audiences.includes(seen.addresses.proxy);
      }),
    "never send the caller's own token on: it was minted for the proxy, not for the upstream",
  ),
];
