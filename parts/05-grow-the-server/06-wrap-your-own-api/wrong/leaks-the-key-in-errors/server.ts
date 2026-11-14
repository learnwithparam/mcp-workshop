// An MCP server for one web API. Every endpoint in my-api.json becomes one tool.
// The address comes from MY_API_URL and the key from MY_API_TOKEN, so no secret is in this file.
// Check it with: bun run verify wrap-your-own-api
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

type Param = {
  name: string;
  in: "path" | "query" | "body";
  type: "string" | "number";
  about: string;
};
type Endpoint = {
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  params: Param[];
};

const endpoints: Endpoint[] = JSON.parse(
  readFileSync(new URL("my-api.json", import.meta.url), "utf8"),
).endpoints;
const baseUrl = process.env.MY_API_URL ?? "";
const token = process.env.MY_API_TOKEN ?? "";

const textResult = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

/** The input a tool accepts: one field for each parameter. */
function inputFor(endpoint: Endpoint) {
  const fields: Record<string, z.ZodType> = {};
  for (const param of endpoint.params) {
    const kind = param.type === "number" ? z.number() : z.string();
    fields[param.name] = kind.describe(param.about);
  }
  return z.object(fields);
}

/** The request for one call: path values filled in, the rest in the query or the body. */
function requestFor(endpoint: Endpoint, args: Record<string, unknown>) {
  let path = endpoint.path;
  const query = new URLSearchParams();
  const body: Record<string, unknown> = {};
  for (const param of endpoint.params) {
    const value = args[param.name];
    if (param.in === "path")
      path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
    if (param.in === "query") query.set(param.name, String(value));
    if (param.in === "body") body[param.name] = value;
  }
  const url = new URL(path, baseUrl);
  url.search = query.toString();
  const hasBody = Object.keys(body).length > 0;
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (hasBody) headers["content-type"] = "application/json";
  return {
    url,
    init: { method: endpoint.method, headers, body: hasBody ? JSON.stringify(body) : undefined },
  };
}

async function callApi(endpoint: Endpoint, args: Record<string, unknown>) {
  const { url, init } = requestFor(endpoint, args);
  try {
    const answer = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
    const text = await answer.text();
    if (answer.ok) return textResult(text);
    return textResult(`The API answered ${answer.status} to ${JSON.stringify(init)}`, true);
  } catch {
    return textResult("The API did not answer. Try again in a moment.", true);
  }
}

/** A read changes nothing. A DELETE destroys. The other methods write. */
function annotationsFor(endpoint: Endpoint) {
  return {
    readOnlyHint: endpoint.method === "GET",
    destructiveHint: endpoint.method === "DELETE",
  };
}

export function createServer() {
  const server = new McpServer({ name: "my-api", version: "1.0.0" });
  for (const endpoint of endpoints) {
    server.registerTool(
      endpoint.name,
      {
        description: endpoint.description,
        inputSchema: inputFor(endpoint),
        annotations: annotationsFor(endpoint),
      },
      (args: Record<string, unknown>) => callApi(endpoint, args),
    );
  }
  return server;
}

if (import.meta.main) {
  serveStdio(createServer);
  // stdout carries the protocol messages, so log lines go to stderr.
  console.error("my-api server running on stdio");
}
