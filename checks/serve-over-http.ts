// serve-over-http: the server answers MCP over Streamable HTTP with no session, refuses a strange
// Host header, and still serves clients that start the 2025 way with initialize.
import {
  connectClient,
  LEGACY_VERSION,
  rawCall,
  textOf,
  toolNames,
  withHttpServer,
} from "../parts/03-open-the-server-safely/http-check-kit";
import { timesIn } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";

const run = scenario(async (dir) =>
  withHttpServer(dir, async ({ url, world }) => {
    const statelessList = await rawCall(url, { method: "tools/list" });
    const badHost = await rawCall(url, { method: "tools/list", host: "evil.example" });
    const legacyHello = await rawCall(url, {
      method: "initialize",
      era: "legacy",
      params: {
        protocolVersion: LEGACY_VERSION,
        capabilities: {},
        clientInfo: { name: "older-host", version: "1.0.0" },
      },
    });
    const slotsText = await freeSlotsOverHttp(url).catch(() => "");
    const trueTimes = world.freeSlots({ site: "millbrook", length: 20 }).map((slot) => slot.start);
    return { statelessList, badHost, legacyHello, slotsText, trueTimes };
  }),
);

async function freeSlotsOverHttp(url: string): Promise<string> {
  const client = await connectClient(url);
  try {
    const slots = await client.callTool({
      name: "find_free_slots",
      arguments: { site: "millbrook" },
    });
    return textOf(slots);
  } finally {
    await client.close();
  }
}

let lastError = "";
const ok = async (dir: string) => {
  const outcome = await run(dir);
  return failed(outcome) ? undefined : outcome;
};

export default [
  rule(
    "bun http.ts starts and answers on the port in MCP_PORT",
    async (dir) => {
      const outcome = await run(dir);
      lastError = failed(outcome) ? outcome.failed : "";
      return !failed(outcome);
    },
    () =>
      "serve with Bun.serve({ hostname: '127.0.0.1', port, fetch }) and read the port from " +
      `process.env.MCP_PORT. The checker saw: ${lastError || "nothing"}`,
  ),
  rule(
    "A tools/list request with no initialize and no session id lists the clinic tools",
    async (dir) => {
      const list = (await ok(dir))?.statelessList;
      if (list?.status !== 200) return false;
      const noSession = !list.headers.get("mcp-session-id");
      return noSession && toolNames(list.body.result).includes("find_free_slots");
    },
    "hand every request to createMcpHandler(() => createServer()) and return its Response; " +
      "it serves each request on its own, with no session",
  ),
  rule(
    "A request with the header Host: evil.example gets 403",
    async (dir) => (await ok(dir))?.badHost.status === 403,
    "check the Host header first: hostHeaderValidationResponse(request, " +
      "localhostAllowedHostnames()) returns a 403 Response for a host that is not local",
  ),
  rule(
    "A 2025-era client that starts with initialize is still served",
    async (dir) => {
      const hello = (await ok(dir))?.legacyHello;
      return hello?.status === 200 && hello.body.result?.protocolVersion === LEGACY_VERSION;
    },
    "keep the default legacy: 'stateless' option of createMcpHandler, so Claude clients " +
      "that still send initialize keep working",
  ),
  rule(
    "The MCP client calls find_free_slots over HTTP and gets the free times in the diary",
    async (dir) => {
      const outcome = await ok(dir);
      if (!outcome || outcome.trueTimes.length === 0) return false;
      const shown = new Set(timesIn(outcome.slotsText));
      return outcome.trueTimes.every((time) => shown.has(time));
    },
    "serve the same createServer() from server.ts; only the way requests arrive changes",
  ),
];
