// expose-the-diary: a stdio MCP server with one read tool, find_free_slots, that answers from the
// live diary.
import { call, listTools, stdoutBeforeAnyRequest, timesIn, withServer } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";
import { freshWorld } from "./lib/world";

// The parts of a tool's JSON Schema that the rules read.
type ArgumentSchema = { description?: unknown };
type InputSchema = { properties?: Record<string, ArgumentSchema> };

const BOOK_BEHIND_THE_SERVERS_BACK = [
  "INSERT INTO appointments VALUES ",
  "('A-CHECK','P-0002','S-05','millbrook',?, '10:20', 20, 'Check', 'booked')",
].join("");

const run = scenario(async (dir) =>
  withServer(dir, async ({ client, world }) => {
    const era = client.getProtocolEra();
    const { tools } = await listTools(client);
    const tool = tools.find((candidate) => candidate.name === "find_free_slots");
    const freeSlots = world.freeSlots({ site: "millbrook", length: 20 });
    const truth = freeSlots.map((slot) => slot.start).sort();
    const askForSlots = () => call(client, "find_free_slots", { site: "millbrook", length: 20 });
    const first = tool ? await askForSlots() : undefined;
    // Change the diary behind the server's back, then ask again: a live answer must change too.
    world.exec(BOOK_BEHIND_THE_SERVERS_BACK, world.clock.date);
    const after = tool ? await askForSlots() : undefined;
    return { era, tool, truth, first, after };
  }),
);
const ok = async (dir: string) => {
  const outcome = await run(dir);
  return failed(outcome) ? undefined : outcome;
};
let lastError = "";
const checkerSaw = () => (lastError ? ` The checker saw: ${lastError}` : "");

const sentences = (text = "") => {
  const pieces = text.split(/[.!?](\s|$)/);
  return pieces.filter((piece) => piece && piece.trim().length > 1).length;
};

function isGoodDescription(description: string): boolean {
  const count = sentences(description);
  return description.split(/\s+/).length >= 8 && count >= 1 && count <= 3;
}

function everyArgumentDescribed(properties: Record<string, ArgumentSchema>): boolean {
  return Object.values(properties).every(
    (argument) => typeof argument.description === "string" && argument.description.length > 5,
  );
}

export default [
  rule(
    "The server starts over stdio and answers an MCP client",
    async (dir) => {
      const outcome = await run(dir);
      lastError = failed(outcome) ? outcome.failed : "";
      return !failed(outcome);
    },
    () =>
      'start it by hand with "bun server.ts" in the problem folder and read the error.' +
      checkerSaw(),
  ),
  rule(
    "It writes nothing to stdout until a client asks something",
    async (dir) => (await stdoutBeforeAnyRequest(dir, freshWorld().env)).trim() === "",
    "stdout carries the protocol; change console.log to console.error for every log line",
  ),
  rule(
    "It speaks the current MCP spec revision (it answers server/discover)",
    async (dir) => (await ok(dir))?.era === "modern",
    "build the server with @modelcontextprotocol/server and serveStdio from " +
      "@modelcontextprotocol/server/stdio, as the starter does",
  ),
  rule(
    "tools/list has a tool called find_free_slots",
    async (dir) => Boolean((await ok(dir))?.tool),
    'register it with server.registerTool("find_free_slots", { description, inputSchema }, handler)',
  ),
  rule(
    "Its description is one to three sentences of at least 8 words",
    async (dir) => isGoodDescription((await ok(dir))?.tool?.description ?? ""),
    "say what the tool returns and when to use it, for example: " +
      "List free start times at one site, for each vet. Use it before booking.",
  ),
  rule(
    "It takes site and length, and every argument has a description",
    async (dir) => {
      const schema = (await ok(dir))?.tool?.inputSchema as InputSchema | undefined;
      const properties = schema?.properties ?? {};
      return "site" in properties && "length" in properties && everyArgumentDescribed(properties);
    },
    'add .describe("...") to each Zod field; ' +
      "the description is the only help the model gets for that argument",
  ),
  rule(
    "For Millbrook and 20 minutes it returns exactly the free slots in the diary",
    async (dir) => {
      const outcome = await ok(dir);
      if (!outcome?.first || outcome.first.isError) return false;
      const answered = [...new Set(timesIn(outcome.first.text))].sort();
      return JSON.stringify(answered) === JSON.stringify(outcome.truth);
    },
    "call clinic.freeSlots({ site, date, length }) and put every start time in the text; " +
      "try it with bun run try find_free_slots '{\"site\":\"millbrook\"}' --server <your folder>",
  ),
  rule(
    "It reads the live diary: a slot booked behind its back disappears from the next answer",
    async (dir) => {
      const after = (await ok(dir))?.after;
      if (!after || after.isError) return false;
      const times = timesIn(after.text);
      return !times.includes("10:20") && times.includes("11:40");
    },
    "ask clinic.freeSlots on every call; never copy the answer into your code",
  ),
];
