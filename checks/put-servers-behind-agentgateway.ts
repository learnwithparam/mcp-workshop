// put-servers-behind-agentgateway: the learner's config.yaml puts both course servers behind one
// agentgateway with a token rule and an allow-list. The check starts the compose file in
// assignment/, then calls the gateway as an MCP client. It judges what the client sees.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASSIGNMENT_DIR,
  connectThrough,
  GATEWAY_IMAGE,
  GATEWAY_URL,
  startGateway,
} from "./lib/gateway";
import { call, timesIn } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";

const ALLOWED_TOOL = "clinic_find_free_slots";
// Tools the allow-list must refuse: one from each server.
const BLOCKED_TOOLS = [
  { name: "lab_export_all_results", args: { sendTo: "anyone@example.org" } },
  { name: "clinic_read_notes", args: { patientId: "P-0001" } },
];

/** The learner's folder is `problem/`, which stands for the assignment/ folder they work in. */
const workFolder = (dir: string) =>
  dir.endsWith(join("put-servers-behind-agentgateway", "problem")) ? ASSIGNMENT_DIR : dir;

async function noTokenStatus(): Promise<number> {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const reply = await fetch(GATEWAY_URL, { method: "POST", headers, body });
  return reply.status;
}

/** Everything the rules judge, seen through the gateway. */
const run = scenario(async (dir) => {
  const gateway = await startGateway(workFolder(dir));
  try {
    const client = await connectThrough(gateway.callerToken);
    try {
      const noToken = await noTokenStatus();
      const { tools } = await client.listTools();
      const allowed = await call(client, ALLOWED_TOOL, { site: "millbrook" });
      const blocked = [];
      for (const tool of BLOCKED_TOOLS) blocked.push(await call(client, tool.name, tool.args));
      return { noToken, names: tools.map((tool) => tool.name), allowed, blocked };
    } finally {
      await client.close().catch(() => {});
    }
  } finally {
    await gateway.stop();
  }
});

type Seen = Exclude<Awaited<ReturnType<typeof run>>, { failed: string }>;

async function judged(dir: string, judge: (seen: Seen) => boolean): Promise<boolean> {
  const seen = await run(dir);
  if (failed(seen)) throw new Error(seen.failed);
  return judge(seen);
}

const fromServer = (seen: Seen, prefix: string) =>
  seen.names.some((name) => name.startsWith(prefix));

export default [
  rule(
    `The gateway image is ${GATEWAY_IMAGE}`,
    () => readFileSync(join(ASSIGNMENT_DIR, "compose.yml"), "utf8").includes(GATEWAY_IMAGE),
    "Keep the image line in assignment/compose.yml exactly as the starter has it.",
  ),
  rule(
    "tools/list through the gateway shows tools from the clinic server and the lab server",
    (dir) => judged(dir, (seen) => fromServer(seen, "clinic_") && fromServer(seen, "lab_")),
    "Add the lab server as a second target in config.yaml, at http://127.0.0.1:8802/mcp.",
  ),
  rule(
    "A request with no token is refused with 401",
    (dir) => judged(dir, (seen) => seen.noToken === 401),
    "Add a jwtAuth rule with mode strict to the route's policies.",
  ),
  rule(
    "The allowed tool returns real free slots",
    (dir) => judged(dir, (seen) => !seen.allowed.isError && timesIn(seen.allowed.text).length > 0),
    "Each target needs a backendAuth key that points at its token file in /run/keys.",
  ),
  rule(
    "A tool that is not on the allow-list returns an error",
    (dir) => judged(dir, (seen) => seen.blocked.every((result) => result.isError || result.thrown)),
    "Add mcpAuthorization rules that allow only the tools you name, and nothing else.",
  ),
  rule(
    "The tools list shows only the allowed tools",
    (dir) => judged(dir, (seen) => seen.names.includes(ALLOWED_TOOL) && seen.names.length <= 3),
    "Allow at most one read-only tool from each server, so the list stays short.",
  ),
];
