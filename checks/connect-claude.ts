// connect-claude: a host config (.mcp.json) that starts the server, and the answer Claude gave
// from the live diary.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listTools, timesIn, withServer } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";
import { freshWorld } from "./lib/world";

// One entry under mcpServers in .mcp.json, before we know it is well formed.
type ServerEntry = { command?: unknown; args?: unknown };
type ServerConfig = { name: string; command: string; args: string[] };

/** The first server in .mcp.json, or undefined when there is none or it has no command. */
function config(dir: string): ServerConfig | undefined {
  try {
    const mcpJson = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
    const servers: Record<string, ServerEntry> = mcpJson.mcpServers ?? {};
    const [name, server] = Object.entries(servers)[0] ?? [];
    if (!server || typeof server.command !== "string") return undefined;
    return { name, command: server.command, args: (server.args ?? []) as string[] };
  } catch {
    return undefined;
  }
}

function answer(dir: string) {
  const notesPath = join(dir, "notes", "connect-claude.md");
  if (!existsSync(notesPath)) return { question: "", answer: "" };
  const notes = readFileSync(notesPath, "utf8");
  return {
    question: notes.match(/^Question:\s*(.+)$/m)?.[1]?.trim() ?? "",
    answer: notes.split(/^Answer:/m)[1]?.trim() ?? "",
  };
}

const run = scenario(async (dir) => {
  const server = config(dir);
  if (!server) throw new Error("no server in .mcp.json");
  return withServer(
    dir,
    async ({ client }) => {
      const { tools } = await listTools(client);
      return { names: tools.map((tool) => tool.name) };
    },
    { launch: { command: server.command, args: server.args } },
  );
});
let lastError = "";
const checkerSaw = () => (lastError ? ` The checker saw: ${lastError}` : "");
const freeSlots = freshWorld().freeSlots({ site: "millbrook", length: 20 });
const truth = freeSlots.map((slot) => slot.start);

export default [
  rule(
    ".mcp.json names one server under mcpServers, with a command",
    async (dir) => Boolean(config(dir)),
    "create problem/.mcp.json: " +
      '{ "mcpServers": { "harrow-lane": { "command": "bun", "args": ["server.ts"] } } }',
  ),
  rule(
    "Starting that exact command gives a working MCP server",
    async (dir) => {
      const outcome = await run(dir);
      lastError = failed(outcome) ? outcome.failed : "";
      return !failed(outcome);
    },
    () =>
      "run the command and args from .mcp.json yourself in the problem folder; " +
      `the path in args must point at your server.${checkerSaw()}`,
  ),
  rule(
    "That server lists find_free_slots and book_appointment",
    async (dir) => {
      const outcome = await run(dir);
      if (failed(outcome)) return false;
      return ["find_free_slots", "book_appointment"].every((name) => outcome.names.includes(name));
    },
    "point .mcp.json at the server from return-errors-the-model-can-fix, which has both tools",
  ),
  rule(
    "notes/connect-claude.md has the question and Claude's answer",
    async (dir) => {
      const notes = answer(dir);
      return notes.question.length > 5 && notes.answer.length > 20;
    },
    'ask Claude the question in the file, then paste its whole answer after "Answer:"',
  ),
  rule(
    "The answer names a Millbrook vet and at least one real free slot",
    async (dir) => {
      const reply = answer(dir).answer;
      return /Reyes|Cole/.test(reply) && timesIn(reply).some((time) => truth.includes(time));
    },
    "if Claude says it cannot see the diary, the server is not connected: " +
      "run /mcp in Claude Code, or open Claude Desktop's developer settings, " +
      "and check harrow-lane is on",
  ),
  rule(
    "Every time in the answer is a free slot in the diary (nothing made up)",
    async (dir) => {
      const times = timesIn(answer(dir).answer);
      return times.length > 0 && times.every((time) => truth.includes(time));
    },
    "paste Claude's answer exactly; " +
      "if it names a time that is not free, ask again and check that it called find_free_slots",
  ),
];
