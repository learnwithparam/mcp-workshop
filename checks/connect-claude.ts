// connect-claude: a host config (.mcp.json) that starts the server, and the answer Claude gave from the live diary.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listTools, timesIn, withServer } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";
import { freshWorld } from "./lib/world";

const config = (dir: string) => {
  try {
    const servers = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers ?? {};
    const [name, s] = Object.entries(servers)[0] ?? [];
    return s && typeof (s as any).command === "string" ? { name, command: (s as any).command as string, args: ((s as any).args ?? []) as string[] } : undefined;
  } catch { return undefined; }
};
const answer = (dir: string) => {
  const f = join(dir, "notes", "connect-claude.md");
  if (!existsSync(f)) return { question: "", answer: "" };
  const t = readFileSync(f, "utf8");
  return { question: t.match(/^Question:\s*(.+)$/m)?.[1]?.trim() ?? "", answer: t.split(/^Answer:/m)[1]?.trim() ?? "" };
};

const run = scenario(async (dir) => {
  const c = config(dir);
  if (!c) throw new Error("no server in .mcp.json");
  return withServer(dir, async ({ client }) => ({ names: (await listTools(client)).tools.map((t) => t.name) }), { launch: { command: c.command, args: c.args } });
});
let lastError = "";
const truth = freshWorld().freeSlots({ site: "millbrook", length: 20 }).map((s) => s.start);

export default [
  rule(".mcp.json names one server under mcpServers, with a command", async (dir) => Boolean(config(dir)),
    "create problem/.mcp.json: { \"mcpServers\": { \"harrow-lane\": { \"command\": \"bun\", \"args\": [\"server.ts\"] } } }"),
  rule("Starting that exact command gives a working MCP server", async (dir) => {
    const r = await run(dir);
    lastError = failed(r) ? r.failed : "";
    return !failed(r);
  }, () => `run the command and args from .mcp.json yourself in the problem folder; the path in args must point at your server.${lastError ? ` The checker saw: ${lastError}` : ""}`),
  rule("That server lists find_free_slots and book_appointment", async (dir) => {
    const r = await run(dir);
    return !failed(r) && ["find_free_slots", "book_appointment"].every((n) => r.names.includes(n));
  }, "point .mcp.json at the server from return-errors-the-model-can-fix, which has both tools"),
  rule("notes/connect-claude.md has the question and Claude's answer", async (dir) => { const a = answer(dir); return a.question.length > 5 && a.answer.length > 20; },
    "ask Claude the question in the file, then paste its whole answer after \"Answer:\""),
  rule("The answer names a Millbrook vet and at least one real free slot", async (dir) => {
    const a = answer(dir).answer;
    return /Reyes|Cole/.test(a) && timesIn(a).some((t) => truth.includes(t));
  }, "if Claude says it cannot see the diary, the server is not connected: run /mcp in Claude Code, or open Claude Desktop's developer settings, and check harrow-lane is on"),
  rule("Every time in the answer is a free slot in the diary (nothing made up)", async (dir) => {
    const times = timesIn(answer(dir).answer);
    return times.length > 0 && times.every((t) => truth.includes(t));
  }, "paste Claude's answer exactly; if it names a time that is not free, ask again and check that it called find_free_slots"),
];
