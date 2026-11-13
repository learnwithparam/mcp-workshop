// A small MCP client: start a server, find out which protocol it speaks, list its tools, call one.
//   bun client.ts <server.ts> <tool> '<json arguments>'
// For example: bun client.ts ../legacy-lab/server.ts lab_status '{}'
// Check it with: bun run verify build-a-small-client
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

type TextBlock = { type: string; text?: string };

/** Starts the server script with Bun and connects. "auto" tries server/discover first. */
async function connect(serverScript: string): Promise<Client> {
  const client = new Client(
    { name: "harrow-lane-small-client", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
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
  // Only a 2026-07-28 server answers server/discover. An older one gives no list.
  const discovered = client.getDiscoverResult();
  const supported = discovered?.supportedVersions.join(", ");
  console.log(`Supported versions: ${supported ?? "unknown, the server has no server/discover"}`);
}

async function callOneTool(client: Client, toolName: string, json: string) {
  const result = await client.callTool({ name: toolName, arguments: JSON.parse(json) });
  const blocks = result.content as TextBlock[];
  const text = blocks.map((block) => block.text ?? `[${block.type}]`).join("\n");
  // Long results are cut to their first four lines, so the output stays short.
  const firstLines = text.split("\n").slice(0, 4);
  console.log(`Called ${toolName}:`);
  for (const line of firstLines) console.log(`  ${line}`);
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
