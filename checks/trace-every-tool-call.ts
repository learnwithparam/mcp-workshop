// trace-every-tool-call: each tool call leaves one trace span at a collector. The check starts a
// small collector, starts serve.ts from your folder with its address, makes three tool calls, and
// reads the spans it received. It never reads the learner's code.
import { resolve } from "node:path";
import { DEMO, mintToken } from "../world/auth";
import { failed, rule, scenario } from "./lib/rules";
import { freshWorld } from "./lib/world";

const PUBLIC_URL = "https://harrow-lane.example.net/mcp";
const READY_TIMEOUT_MS = 10000;
const SPAN_WAIT_MS = 4000;
const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const PARENT_ID = "00f067aa0ba902b7";

type Target = { socketUrl: string };
type Attribute = { key: string; value: { stringValue?: string } };
type Span = {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: Attribute[];
  status?: { code?: number };
};
type StaffRow = { id: string; role: string; site: string };

const world = freshWorld();

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port as number;
  probe.stop(true);
  return port;
}

type Posted = { resourceSpans?: { scopeSpans?: { spans?: Span[] }[] }[] };

/** Every span inside one OTLP JSON body. */
function spansIn(body: Posted): Span[] {
  const scopes = (body.resourceSpans ?? []).flatMap((resource) => resource.scopeSpans ?? []);
  return scopes.flatMap((scope) => scope.spans ?? []);
}

/** A tiny collector: it keeps every span that is posted to /v1/traces. */
function startCollector() {
  const spans: Span[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (request.method === "POST" && path === "/v1/traces") {
        const body = await request.json().catch(() => ({}));
        spans.push(...spansIn(body));
      }
      return new Response("{}", { headers: { "content-type": "application/json" } });
    },
  });
  return { spans, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}

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
  const { id, role, site } = staff;
  return mintToken({ staffId: id, role, site, audience: PUBLIC_URL });
}

type ToolCall = {
  token: string;
  tool: string;
  args: Record<string, unknown>;
  traceparent?: string;
};

async function callTool(target: Target, call: ToolCall): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${call.token}`,
  };
  if (call.traceparent) headers.traceparent = call.traceparent;
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: call.tool, arguments: call.args },
  };
  const answer = await send(target, new URL(PUBLIC_URL).pathname, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  await answer.text();
  return answer;
}

/** Starts serve.ts with these settings, lets `act` talk to it, and always stops it. */
async function rehearse<Result>(
  dir: string,
  collectorUrl: string,
  act: (target: Target) => Promise<Result>,
): Promise<Result | { answering: false }> {
  const port = freePort();
  const target = { socketUrl: `http://127.0.0.1:${port}/` };
  // biome-ignore-start lint/style/useNamingConvention: environment variable names are upper case
  const settings = {
    PORT: String(port),
    PUBLIC_URL,
    OTEL_EXPORTER_OTLP_ENDPOINT: collectorUrl,
  };
  // biome-ignore-end lint/style/useNamingConvention: environment variable names end here
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

async function waitForSpans(spans: Span[], count: number): Promise<void> {
  const deadline = Date.now() + SPAN_WAIT_MS;
  while (spans.length < count && Date.now() < deadline) await Bun.sleep(100);
}

const tracedRun = scenario(async (dir) => {
  const collector = startCollector();
  try {
    const seen = await rehearse(dir, collector.url, async (target) => {
      const joon = await tokenFor(DEMO.joon);
      const ola = await tokenFor(DEMO.ola);
      const traceparent = `00-${TRACE_ID}-${PARENT_ID}-01`;
      const find = { token: joon, tool: "find_patient", args: { name: "Pepper" }, traceparent };
      const slots = { token: joon, tool: "find_free_slots", args: { site: "harrow-lane" } };
      const refused = { token: ola, tool: "read_notes", args: { patientId: "P-0042" } };
      for (const call of [find, slots, refused]) await callTool(target, call);
      await waitForSpans(collector.spans, 3);
      return { answering: true as const };
    });
    return { ...seen, spans: [...collector.spans] };
  } finally {
    collector.stop();
  }
});

/** The collector is down. A tool call must still be answered, and quickly. */
const deadCollectorRun = scenario(async (dir) => {
  const deadUrl = `http://127.0.0.1:${freePort()}`;
  return rehearse(dir, deadUrl, async (target) => {
    const startedAt = Date.now();
    const answer = await callTool(target, {
      token: await tokenFor(DEMO.joon),
      tool: "find_patient",
      args: { name: "Pepper" },
    });
    return { answering: true as const, status: answer.status, ms: Date.now() - startedAt };
  });
});

const attribute = (span: Span, key: string) =>
  span.attributes?.find((candidate) => candidate.key === key)?.value.stringValue;
const spanFor = (spans: Span[], tool: string) =>
  spans.filter((span) => attribute(span, "gen_ai.tool.name") === tool);

type Seen = { answering: true; spans: Span[] };

async function judged(dir: string, judge: (spans: Span[]) => boolean): Promise<boolean> {
  const seen = await tracedRun(dir);
  if (failed(seen) || !(seen as Seen).answering) return false;
  return judge((seen as Seen).spans);
}

const isHex = (value: string | undefined, length: number) =>
  new RegExp(`^[0-9a-f]{${length}}$`).test(value ?? "");

export default [
  rule(
    "Each tool call leaves one span named after the method and the tool",
    (dir) =>
      judged(dir, (spans) => {
        const names = ["find_patient", "find_free_slots", "read_notes"];
        return spans.length === 3 && names.every((tool) => spanFor(spans, tool).length === 1);
      }),
    'send one span per tools/call, named "tools/call <tool name>", to the collector /v1/traces',
  ),
  rule(
    "Each span names the method, the operation and the tool",
    (dir) =>
      judged(
        dir,
        (spans) =>
          spans.length > 0 &&
          spans.every(
            (span) =>
              attribute(span, "mcp.method.name") === "tools/call" &&
              attribute(span, "gen_ai.operation.name") === "execute_tool" &&
              span.name === `tools/call ${attribute(span, "gen_ai.tool.name")}`,
          ),
      ),
    "add mcp.method.name, gen_ai.operation.name (execute_tool) and gen_ai.tool.name attributes",
  ),
  rule(
    "Each span has a 32 digit trace id, a 16 digit span id and an end after its start",
    (dir) =>
      judged(
        dir,
        (spans) =>
          spans.length > 0 &&
          spans.every(
            (span) =>
              isHex(span.traceId, 32) &&
              isHex(span.spanId, 16) &&
              BigInt(span.endTimeUnixNano ?? 0) >= BigInt(span.startTimeUnixNano ?? 1),
          ),
      ),
    "ids are lower case hex text, and times are nanoseconds since 1970 written as strings",
  ),
  rule(
    "A request with a traceparent header joins that trace",
    (dir) =>
      judged(dir, (spans) => {
        const [span] = spanFor(spans, "find_patient");
        return span?.traceId === TRACE_ID && span.parentSpanId === PARENT_ID;
      }),
    "read the trace id and parent id from the traceparent header, and reuse them in the span",
  ),
  rule(
    "A failed call is marked as an error, and a good call is not",
    (dir) =>
      judged(dir, (spans) => {
        const [good] = spanFor(spans, "find_free_slots");
        const [bad] = spanFor(spans, "read_notes");
        const goodIsFine = good?.status?.code !== 2 && !attribute(good ?? {}, "error.type");
        return goodIsFine && bad?.status?.code === 2 && Boolean(attribute(bad, "error.type"));
      }),
    `set status code 2 and an error.type attribute when the call fails`,
  ),
  rule(
    "No span holds a pet name, a patient id or any tool argument",
    (dir) =>
      judged(
        dir,
        (spans) => spans.length > 0 && !/Pepper|P-0042|harrow-lane"/.test(JSON.stringify(spans)),
      ),
    "record the tool name and the outcome only; arguments and results can hold private data",
  ),
  rule(
    "A collector that is down does not slow or break a tool call",
    async (dir) => {
      const seen = await deadCollectorRun(dir);
      if (failed(seen) || !(seen as { answering: boolean }).answering) return false;
      const result = seen as { status: number; ms: number };
      return result.status === 200 && result.ms < 1500;
    },
    "send the span without waiting for it: do not await the fetch, and catch its error",
  ),
];
