// publish-to-the-registry: server.json describes the deployed server for the MCP Registry. It must
// match the registry's own schema (version 2025-12-11, copied into the step folder), and follow
// the rules a schema cannot say: an exact version, a public https address, a secret token.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fromJsonSchema } from "@modelcontextprotocol/server";
import { rule } from "./lib/rules";

const STEP_DIR = join(import.meta.dir, "..", "parts", "05-grow-the-server");
const SCHEMA_FILE = join(STEP_DIR, "04-publish-to-the-registry", "registry", "server.schema.json");
const SCHEMA_URL = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

type Header = { name?: string; isRequired?: boolean; isSecret?: boolean };
type Remote = { type?: string; url?: string; headers?: Header[] };
type ServerJson = { $schema?: string; name?: string; version?: string; remotes?: Remote[] };

const registrySchema = fromJsonSchema(JSON.parse(readFileSync(SCHEMA_FILE, "utf8")));

function serverJson(dir: string): ServerJson | undefined {
  const path = join(dir, "server.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ServerJson;
  } catch {
    return undefined;
  }
}

let schemaProblem = "";

async function matchesSchema(dir: string): Promise<boolean> {
  const server = serverJson(dir);
  if (!server) {
    schemaProblem = "server.json is missing or is not valid JSON";
    return false;
  }
  const outcome = await registrySchema["~standard"].validate(server);
  const issues = "issues" in outcome ? (outcome.issues ?? []) : [];
  schemaProblem = issues.map((issue) => issue.message).join("; ");
  return issues.length === 0;
}

/** The first remote that uses Streamable HTTP. */
function streamableRemote(dir: string): Remote | undefined {
  const remotes = serverJson(dir)?.remotes ?? [];
  return remotes.find((remote) => remote.type === "streamable-http");
}

function isPublicMcpAddress(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const address = new URL(url);
  const isLocal = ["127.0.0.1", "localhost", "0.0.0.0"].includes(address.hostname);
  return address.protocol === "https:" && !isLocal && address.pathname.endsWith("/mcp");
}

export default [
  rule(
    "server.json matches the MCP Registry schema (2025-12-11)",
    matchesSchema,
    () => `fix what the schema says: ${schemaProblem}`,
  ),
  rule(
    "Its $schema names the 2025-12-11 server schema",
    async (dir) => serverJson(dir)?.$schema === SCHEMA_URL,
    `set "$schema" to ${SCHEMA_URL}`,
  ),
  rule(
    "Its name is a namespace and a server name, such as io.github.<you>/harrow-lane",
    async (dir) => /^[a-z0-9-]+\.[a-z0-9.-]+\/[a-z0-9._-]+$/i.test(serverJson(dir)?.name ?? ""),
    "use the reverse of a domain or account you own, then a slash and a short name: " +
      '"io.github.<you>/harrow-lane"',
  ),
  rule(
    "Its version is one exact version, such as 1.0.0, never a range or latest",
    async (dir) => /^\d+\.\d+\.\d+$/.test(serverJson(dir)?.version ?? ""),
    'each release gets one exact version, such as "1.0.0", so a host knows what it installs',
  ),
  rule(
    "It has a streamable-http remote at a public https address ending in /mcp",
    async (dir) => isPublicMcpAddress(streamableRemote(dir)?.url ?? ""),
    "use the address from deploy-the-server, not 127.0.0.1: nobody else can reach your laptop",
  ),
  rule(
    "The remote asks for an Authorization header that is required and secret",
    async (dir) => {
      const headers = streamableRemote(dir)?.headers ?? [];
      const authorization = headers.find((header) => header.name === "Authorization");
      return authorization?.isRequired === true && authorization.isSecret === true;
    },
    'add headers: [{ "name": "Authorization", "isRequired": true, "isSecret": true }], ' +
      "so a host asks for the token and never shows it",
  ),
];
