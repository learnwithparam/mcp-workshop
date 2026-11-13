// A small MCP client: start a server, find out which protocol it speaks, list its tools, call one.
//   bun client.ts <server.ts> <tool> '<json arguments>'
// For example: bun client.ts ../legacy-lab/server.ts lab_status '{}'
// Check it with: bun run verify build-a-small-client
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

/**
 * Starts the server script with Bun and connects.
 * TODO: pass { versionNegotiation: { mode: "auto" } } as the second argument of new Client.
 * Without it, the client always speaks the old 2025-11-25 protocol, even to a new server.
 */
async function connect(serverScript: string): Promise<Client> {
  const client = new Client({ name: "harrow-lane-small-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverScript],
    stderr: "ignore",
  });
  await client.connect(transport);
  return client;
}

function describeServer(client: Client) {
  const server = client.getServerVersion();
  console.log(`Server: ${server?.name} ${server?.version}`);
  console.log(`Protocol: ${client.getNegotiatedProtocolVersion()} (${client.getProtocolEra()})`);
  // TODO: print "Supported versions: ..." from client.getDiscoverResult()?.supportedVersions.
  // Only a 2026-07-28 server answers server/discover, so an older one gives no list.
}

async function callOneTool(client: Client, toolName: string, json: string) {
  // TODO: call the tool: client.callTool({ name: toolName, arguments: JSON.parse(json) }).
  // Then print "Called <tool>:" and the first four lines of its text content.
  const serverName = client.getServerVersion()?.name;
  console.log(`TODO: call ${toolName} on ${serverName} with ${json}`);
}

const [serverScript, toolName, json = "{}"] = process.argv.slice(2);
if (!serverScript || !toolName) {
  console.log("Use: bun client.ts <server.ts> <tool> '<json arguments>'");
  process.exit(2);
}
const client = await connect(serverScript);
try {
  describeServer(client);
  const { tools } = await client.listTools();
  console.log(`Tools: ${tools.map((tool) => tool.name).join(", ")}`);
  await callOneTool(client, toolName, json);
} finally {
  await client.close();
}
