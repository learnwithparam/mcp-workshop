// bun run try                                       list the finished server's tools (as Ola, the receptionist)
// bun run try <tool> '<json arguments>'              call one tool on the finished server
//   --as ola|sam|joon        call as another member of staff
//   --confirm yes|no         how to answer a confirmation the server asks for (default yes)
//   --server <folder>        call the server in a step folder instead, over stdio
import { connectFinished, connectFolder, type Confirm } from "./connect";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const as = flag("as"), confirm = (flag("confirm") ?? "yes") as Confirm, folder = flag("server");
const [tool, json] = args;

let conn;
try {
  conn = folder ? await connectFolder(folder, { confirm }) : await connectFinished({ as, confirm });
} catch (e) {
  console.log(`Could not connect: ${(e as Error).message}`);
  process.exit(2);
}
const { client } = conn;
try {
  if (!tool) {
    const { tools } = await client.listTools();
    console.log(`${folder ? `The server in ${folder}` : `The finished server, as ${as ?? "ola"},`} has ${tools.length} tool(s):`);
    for (const t of tools) console.log(`  ${t.name}: ${t.description ?? ""}`);
  } else {
    let input: Record<string, unknown> = {};
    try { input = json ? JSON.parse(json) : {}; } catch { console.log(`The arguments are not valid JSON: ${json}`); process.exit(2); }
    const r = await client.callTool({ name: tool, arguments: input });
    console.log(r.isError ? `Tool error from ${tool}:` : `Result from ${tool}:`);
    for (const c of r.content as { type: string; text?: string }[]) console.log(c.type === "text" ? c.text : `[${c.type}]`);
  }
} catch (e) {
  console.log(`Protocol error: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await conn.close();
}
