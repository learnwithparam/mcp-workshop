// bun run try                             list the finished server's tools (as Ola, receptionist)
// bun run try <tool> '<json arguments>'    call one tool on the finished server
//   --as ola|sam|joon        call as another member of staff
//   --confirm yes|no         how to answer a confirmation the server asks for (default yes)
//   --server <folder>        call the server in a step folder instead, over stdio
import type { Client } from "@modelcontextprotocol/client";
import { type Confirm, type Connected, connectFinished, connectFolder } from "./connect";

const args = process.argv.slice(2);

// Takes "--name value" out of the arguments and returns the value.
function takeFlag(name: string): string | undefined {
  const position = args.indexOf(`--${name}`);
  if (position < 0) return undefined;
  const value = args[position + 1];
  args.splice(position, 2);
  return value;
}

const staffName = takeFlag("as");
const confirm = (takeFlag("confirm") ?? "yes") as Confirm;
const folder = takeFlag("server");
const [toolName, json] = args;

async function connect(): Promise<Connected> {
  try {
    if (folder) return await connectFolder(folder, { confirm });
    return await connectFinished({ as: staffName, confirm });
  } catch (error) {
    console.log(`Could not connect: ${(error as Error).message}`);
    process.exit(2);
  }
}

async function listTools(client: Client) {
  const { tools } = await client.listTools();
  let serverName = `The finished server, as ${staffName ?? "ola"},`;
  if (folder) serverName = `The server in ${folder}`;
  console.log(`${serverName} has ${tools.length} tool(s):`);
  for (const tool of tools) console.log(`  ${tool.name}: ${tool.description ?? ""}`);
}

function parseArguments(): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    console.log(`The arguments are not valid JSON: ${json}`);
    process.exit(2);
  }
}

async function callTool(client: Client, name: string) {
  const input = parseArguments();
  const result = await client.callTool({ name, arguments: input });
  console.log(result.isError ? `Tool error from ${name}:` : `Result from ${name}:`);
  for (const content of result.content as { type: string; text?: string }[])
    console.log(content.type === "text" ? content.text : `[${content.type}]`);
}

const connection = await connect();
try {
  if (toolName) await callTool(connection.client, toolName);
  else await listTools(connection.client);
} catch (error) {
  console.log(`Protocol error: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await connection.close();
}
