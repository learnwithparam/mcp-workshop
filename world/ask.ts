// bun run ask "<question>"            ask the front-desk agent, which uses the finished server (as Ola)
//   --as ola|sam|joon                  ask as another member of staff
//   --record                           with a live provider, save this conversation to world/replays/
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPLAY_DIR, ReplayMissing, loadReplays, norm } from "../config/llm";
import { provider } from "../config/models";
import { runAgent } from "./agent";
import { connectFinished } from "./connect";

const args = process.argv.slice(2);
const i = args.indexOf("--as");
const as = i >= 0 ? args.splice(i, 2)[1] : "ola";
const record = args.includes("--record");
const question = args.filter((a) => a !== "--record").join(" ").trim();
if (!question) {
  console.log("Ask a question in quotes. Recorded questions you can ask with no key:");
  for (const c of loadReplays()) console.log(`  bun run ask "${c.question}"${c.as && c.as !== "ola" ? ` --as ${c.as}` : ""}`);
  process.exit(1);
}
const conn = await connectFinished({ as });
try {
  const r = await runAgent(conn.client, question, { as });
  for (const c of r.calls) {
    console.log(`  tool ${c.name} ${JSON.stringify(c.input)}${c.isError ? " (tool error)" : ""}`);
    for (const line of c.text.split("\n").slice(0, 4)) console.log(`    ${line.length > 110 ? line.slice(0, 107) + "..." : line}`);
  }
  console.log(`Answer (as ${as}, provider ${provider()}): ${r.answer}`);
  if (record && provider() !== "replay") {
    const f = join(REPLAY_DIR, "front-desk.json");
    const data = JSON.parse(readFileSync(f, "utf8"));
    data.conversations = data.conversations.filter((c: any) => !(norm(c.question) === norm(question) && c.as === as));
    data.conversations.push({ question, as, steps: r.steps });
    writeFileSync(f, JSON.stringify(data, null, 2) + "\n");
    console.log("Saved to world/replays/front-desk.json.");
  }
} catch (e) {
  console.log(e instanceof ReplayMissing || (e as any)?.cause instanceof ReplayMissing ? (e as Error).message : `The agent failed: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await conn.close();
}
