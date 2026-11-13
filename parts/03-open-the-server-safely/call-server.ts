// Talk to YOUR server over HTTP, as one of the demo staff. Start your server first (bun http.ts).
//
// bun parts/03-open-the-server-safely/call-server.ts --as ola
//     list the tools Ola's token can see
// bun parts/03-open-the-server-safely/call-server.ts --as sam read_notes '{"patientId":"P-0001"}'
//     call one tool as Dr Sam Reyes
//   --confirm yes|no   how to answer when the server asks the person to confirm (default no)
//   --port 8787        the port your server listens on
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { mintToken } from "../../world/auth";
import { STAFF } from "./http-check-kit";

const args = process.argv.slice(2);

// Takes "--name value" out of the arguments and returns the value.
function takeFlag(name: string, fallback: string): string {
  const position = args.indexOf(`--${name}`);
  if (position < 0) return fallback;
  const value = args[position + 1] ?? fallback;
  args.splice(position, 2);
  return value;
}

const who = takeFlag("as", "ola");
const confirm = takeFlag("confirm", "no");
const port = takeFlag("port", "8787");
const [toolName, json] = args;
const url = `http://127.0.0.1:${port}/mcp`;

async function connect(): Promise<Client> {
  const staffMember = STAFF[who];
  if (!staffMember) throw new Error(`No demo staff called "${who}". Use ola, sam or joon.`);
  const token = await mintToken({ ...staffMember, audience: url });
  const client = new Client(
    { name: "call-server", version: "1.0.0" },
    { capabilities: { elicitation: {} }, versionNegotiation: { mode: "auto" } },
  );
  client.setRequestHandler("elicitation/create", async (request) => {
    console.log(`The server asks: ${request.params.message}  (answering ${confirm})`);
    return { action: "accept", content: { confirm: confirm === "yes" } };
  });
  const headers = { authorization: `Bearer ${token}` };
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }),
  );
  return client;
}

async function listTools(client: Client) {
  const { tools } = await client.listTools();
  console.log(`As ${who}, your server lists ${tools.length} tool(s):`);
  for (const tool of tools) console.log(`  ${tool.name}`);
}

async function callTool(client: Client, name: string) {
  const input = json ? JSON.parse(json) : {};
  const result = await client.callTool({ name, arguments: input });
  console.log(result.isError ? `Tool error from ${name}:` : `Result from ${name}:`);
  for (const content of result.content as { type: string; text?: string }[]) {
    console.log(content.text ?? `[${content.type}]`);
  }
}

try {
  const client = await connect();
  if (toolName) await callTool(client, toolName);
  else await listTools(client);
  await client.close();
} catch (error) {
  console.log(`Your server said no: ${(error as Error).message}`);
  process.exitCode = 1;
}
