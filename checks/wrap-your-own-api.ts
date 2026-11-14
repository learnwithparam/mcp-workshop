// wrap-your-own-api: the capstone. The learner's own artefacts are judged, never the clinic:
// my-api.json describes their API, server.ts turns each endpoint into a tool, and EVIDENCE.md shows
// one real call. The check stands up a stand-in for their API, so it proves the shape of the work
// and that evidence exists. It cannot prove the real API is theirs.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connectFolder } from "../world/connect";
import { call } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";

const KEY = "test-key-9f3a7c";
const CLINIC_TOOLS = [
  "find_patient",
  "find_free_slots",
  "book_appointment",
  "move_appointment",
  "cancel_appointment",
  "read_notes",
  "vaccines_due",
  "controlled_drugs_log",
];
const SECRET_NAMES = /token|key|secret|password|authorization/i;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

type Param = { name: string; in: string; type: string; about: string };
type Endpoint = {
  name: string;
  description: string;
  method: string;
  path: string;
  params: Param[];
};
type Spec = { api: string; endpoints: Endpoint[] };
type Seen = { method: string; path: string; query: URLSearchParams; auth: string; body: string };

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

function readSpec(dir: string): Spec | undefined {
  const path = join(dir, "my-api.json");
  if (!existsSync(path)) return undefined;
  try {
    const spec = JSON.parse(readFileSync(path, "utf8")) as Spec;
    return Array.isArray(spec.endpoints) ? spec : undefined;
  } catch {
    return undefined;
  }
}

const sampleValue = (param: Param) => (param.type === "number" ? 7 : "sample-1");

/** The path a correct server asks for: every {name} replaced by the sample value. */
function expectedPath(endpoint: Endpoint): string {
  let path = endpoint.path;
  for (const param of endpoint.params.filter((candidate) => candidate.in === "path")) {
    path = path.replace(`{${param.name}}`, encodeURIComponent(String(sampleValue(param))));
  }
  return path;
}

/** A stand-in for the learner's API: it records each request, and answers 200 or 500. */
function startStandIn() {
  const seen: Seen[] = [];
  let answerWith = 200;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const auth = request.headers.get("authorization") ?? "";
      const body = await request.text();
      seen.push({
        method: request.method,
        path: url.pathname,
        query: url.searchParams,
        auth,
        body,
      });
      return Response.json({ ok: answerWith === 200 }, { status: answerWith });
    },
  });
  return {
    seen,
    url: `http://127.0.0.1:${server.port}`,
    fail: () => {
      answerWith = 500;
    },
    stop: () => server.stop(true),
  };
}

type ToolInfo = {
  name: string;
  description?: string;
  inputSchema: unknown;
  annotations?: Record<string, boolean>;
};
type Outcome = {
  tools: ToolInfo[];
  seen: Seen[];
  results: string[];
  failedCall: { isError: boolean; text: string; stillAnswers: boolean };
};

const run = scenario(async (dir): Promise<Outcome> => {
  const spec = readSpec(dir);
  if (!spec) throw new Error("my-api.json is missing or is not valid JSON");
  const standIn = startStandIn();
  // biome-ignore-start lint/style/useNamingConvention: environment variable names are upper case
  const env = { MY_API_URL: standIn.url, MY_API_TOKEN: KEY };
  // biome-ignore-end lint/style/useNamingConvention: environment variable names end here
  const connection = await connectFolder(dir, { env });
  try {
    const { tools } = await connection.client.listTools();
    const results: string[] = [];
    for (const endpoint of spec.endpoints) {
      const args = Object.fromEntries(
        endpoint.params.map((param) => [param.name, sampleValue(param)]),
      );
      results.push((await call(connection.client, endpoint.name, args)).text);
    }
    const seen = [...standIn.seen];
    standIn.fail();
    const first = spec.endpoints[0];
    const firstArgs = Object.fromEntries(
      first.params.map((param) => [param.name, sampleValue(param)]),
    );
    const failedCall = await call(connection.client, first.name, firstArgs);
    const again = await connection.client.listTools().then(
      () => true,
      () => false,
    );
    return {
      tools: tools as ToolInfo[],
      seen,
      results,
      failedCall: { isError: failedCall.isError, text: failedCall.text, stillAnswers: again },
    };
  } finally {
    await connection.close().catch(() => {});
    standIn.stop();
  }
});

async function judged(dir: string, judge: (outcome: Outcome, spec: Spec) => boolean) {
  const spec = readSpec(dir);
  const outcome = await run(dir);
  if (!spec || failed(outcome)) return false;
  return judge(outcome as Outcome, spec);
}

function inputNamesOf(tool: ToolInfo): string[] {
  const schema = tool.inputSchema as { properties?: Record<string, unknown> };
  return Object.keys(schema.properties ?? {});
}

function endpointIsWellFormed(endpoint: Endpoint): boolean {
  const pathNames = [...endpoint.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
  const declared = (endpoint.params ?? [])
    .filter((param) => param.in === "path")
    .map((param) => param.name);
  return (
    /^[a-z]+(_[a-z]+)+$/.test(endpoint.name) &&
    wordCount(endpoint.description ?? "") >= 8 &&
    METHODS.includes(endpoint.method) &&
    endpoint.path.startsWith("/") &&
    pathNames.every((name) => declared.includes(name))
  );
}

function evidenceText(dir: string): string {
  const path = join(dir, "EVIDENCE.md");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** The text under one "## " heading, up to the next one. */
function evidenceSection(dir: string, heading: string): string {
  const part = evidenceText(dir)
    .split(/^## /m)
    .find((candidate) => candidate.startsWith(`${heading}\n`));
  return part ?? "";
}

function evidenceShowsRealCall(dir: string, spec: Spec): boolean {
  const block = evidenceSection(dir, "A real call").match(/```[a-z]*\n([\s\S]*?)```/)?.[1] ?? "";
  const tool = block.match(/^tool:\s*(\S+)/m)?.[1];
  const endpoint = spec.endpoints.find((candidate) => candidate.name === tool);
  if (!endpoint) return false;
  const request = block.match(/^request:\s*(\w+)\s+(\S+)/m);
  const status = Number(block.match(/^status:\s*(\d{3})\b/m)?.[1]);
  const requestMatches = request?.[1] === endpoint.method;
  return Boolean(requestMatches) && status >= 100 && status <= 599;
}

export default [
  rule(
    "my-api.json describes your own API: no TODO, a read endpoint, and well formed endpoints",
    async (dir) => {
      const spec = readSpec(dir);
      if (!spec || readFileSync(join(dir, "my-api.json"), "utf8").includes("TODO")) return false;
      const names = spec.endpoints.map((endpoint) => endpoint.name);
      const unique = new Set(names).size === names.length;
      const hasRead = spec.endpoints.some((endpoint) => endpoint.method === "GET");
      const wellFormed = spec.endpoints.every(endpointIsWellFormed);
      return spec.endpoints.length >= 2 && unique && hasRead && wellFormed && Boolean(spec.api);
    },
    "list two or more endpoints: snake_case name, method, path, one GET. No TODO",
  ),
  rule(
    "The endpoints are not the clinic's tools",
    async (dir) => {
      const spec = readSpec(dir);
      if (!spec) return false;
      const copied = spec.endpoints.some((endpoint) => CLINIC_TOOLS.includes(endpoint.name));
      return !copied && !/harrow|clinic/i.test(JSON.stringify(spec));
    },
    "wrap an API you work with, such as an order, ticket or booking API, not the clinic diary",
  ),
  rule(
    "The server lists one tool for each endpoint, with its description",
    (dir) =>
      judged(dir, (outcome, spec) =>
        spec.endpoints.every((endpoint) => {
          const tool = outcome.tools.find((candidate) => candidate.name === endpoint.name);
          return tool !== undefined && tool.description === endpoint.description;
        }),
      ),
    "register one tool per endpoint in my-api.json, using its name and description",
  ),
  rule(
    "A GET tool is read-only, a DELETE tool is destructive, and writes are neither",
    (dir) =>
      judged(dir, (outcome, spec) =>
        spec.endpoints.every((endpoint) => {
          const hints = outcome.tools.find((tool) => tool.name === endpoint.name)?.annotations;
          const readOnly = hints?.readOnlyHint === true;
          const destructive = hints?.destructiveHint === true;
          return (
            readOnly === (endpoint.method === "GET") &&
            destructive === (endpoint.method === "DELETE")
          );
        }),
      ),
    "set readOnlyHint for GET and destructiveHint for DELETE, and leave both off for other writes",
  ),
  rule(
    "Each tool sends the right method and path to the API, with its values filled in",
    (dir) =>
      judged(dir, (outcome, spec) =>
        spec.endpoints.every((endpoint, index) => {
          const request = outcome.seen[index];
          const queryOk = endpoint.params
            .filter((param) => param.in === "query")
            .every((param) => request?.query.get(param.name) === String(sampleValue(param)));
          return (
            request?.method === endpoint.method &&
            request.path === expectedPath(endpoint) &&
            queryOk
          );
        }),
      ),
    "replace each {name} in the path, put query values in the query, and send body values as JSON",
  ),
  rule(
    "The key goes in the Authorization header, and never in a tool input or an answer",
    (dir) =>
      judged(dir, (outcome, spec) => {
        const headersOk =
          outcome.seen.length > 0 && outcome.seen.every((seen) => seen.auth === `Bearer ${KEY}`);
        const fieldsOk = spec.endpoints.every(
          (endpoint) => !endpoint.params.some((param) => SECRET_NAMES.test(param.name)),
        );
        const inputNames = outcome.tools.flatMap((tool) => inputNamesOf(tool));
        const schemaOk = !inputNames.some((name) => SECRET_NAMES.test(name));
        const leaked = [...outcome.results, outcome.failedCall.text].some((text) =>
          text.includes(KEY),
        );
        return headersOk && fieldsOk && schemaOk && !leaked;
      }),
    "read MY_API_TOKEN from the environment, send it as Authorization: Bearer, never in a tool",
  ),
  rule(
    "A failed API call gives an error answer the model can read, and the server keeps running",
    (dir) =>
      judged(dir, (outcome) => {
        const { isError, text, stillAnswers } = outcome.failedCall;
        return isError && wordCount(text) >= 4 && !text.includes(KEY) && stillAnswers;
      }),
    "when the API answers 500, return isError with a short message: the status and a next step",
  ),
  rule(
    "EVIDENCE.md has your API, one real call that matches an endpoint, and what you left out",
    async (dir) => {
      const spec = readSpec(dir);
      const text = evidenceText(dir);
      if (!spec || !text || text.includes("TODO")) return false;
      const api = evidenceSection(dir, "My API");
      const leftOut = evidenceSection(dir, "What I left out");
      const bullet = leftOut.split("\n").find((line) => line.startsWith("- ")) ?? "";
      return /https?:\/\//.test(api) && evidenceShowsRealCall(dir, spec) && wordCount(bullet) >= 6;
    },
    "give the API address, a block with tool, request and status lines, and one endpoint left out",
  ),
];
