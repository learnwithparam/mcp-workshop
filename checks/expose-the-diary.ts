// expose-the-diary: a stdio MCP server with one read tool, find_free_slots, that answers from the live diary.
import { call, listTools, stdoutBeforeAnyRequest, timesIn, withServer } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";
import { freshWorld } from "./lib/world";

const run = scenario(async (dir) =>
  withServer(dir, async ({ client, world }) => {
    const era = client.getProtocolEra();
    const { tools } = await listTools(client);
    const tool = tools.find((t) => t.name === "find_free_slots");
    const truth = world.freeSlots({ site: "millbrook", length: 20 }).map((s) => s.start).sort();
    const first = tool ? await call(client, "find_free_slots", { site: "millbrook", length: 20 }) : undefined;
    // Change the diary behind the server's back, then ask again: a live answer must change too.
    world.exec("INSERT INTO appointments VALUES ('A-CHECK','P-0002','S-05','millbrook',?, '10:20', 20, 'Check', 'booked')", world.clock.date);
    const after = tool ? await call(client, "find_free_slots", { site: "millbrook", length: 20 }) : undefined;
    return { era, tool, truth, first, after };
  }));
const ok = async (dir: string) => { const r = await run(dir); return failed(r) ? undefined : r; };
let lastError = "";

const sentences = (s = "") => s.split(/[.!?](\s|$)/).filter((x) => x && x.trim().length > 1).length;

export default [
  rule("The server starts over stdio and answers an MCP client", async (dir) => {
    const r = await run(dir);
    lastError = failed(r) ? r.failed : "";
    return !failed(r);
  }, () => `start it by hand with "bun server.ts" in the problem folder and read the error.${lastError ? ` The checker saw: ${lastError}` : ""}`),
  rule("It writes nothing to stdout until a client asks something", async (dir) => (await stdoutBeforeAnyRequest(dir, freshWorld().env)).trim() === "",
    "stdout carries the protocol; change console.log to console.error for every log line"),
  rule("It speaks the current MCP spec revision (it answers server/discover)", async (dir) => (await ok(dir))?.era === "modern",
    "build the server with @modelcontextprotocol/server and serveStdio from @modelcontextprotocol/server/stdio, as the starter does"),
  rule("tools/list has a tool called find_free_slots", async (dir) => Boolean((await ok(dir))?.tool),
    "register it with server.registerTool(\"find_free_slots\", { description, inputSchema }, handler)"),
  rule("Its description is one to three sentences of at least 8 words", async (dir) => {
    const d = (await ok(dir))?.tool?.description ?? "";
    return d.split(/\s+/).length >= 8 && sentences(d) >= 1 && sentences(d) <= 3;
  }, "say what the tool returns and when to use it, for example: List free start times at one site, for each vet. Use it before booking."),
  rule("It takes site and length, and every argument has a description", async (dir) => {
    const props = ((await ok(dir))?.tool?.inputSchema as any)?.properties ?? {};
    return "site" in props && "length" in props && Object.values(props).every((p: any) => typeof p.description === "string" && p.description.length > 5);
  }, "add .describe(\"...\") to each Zod field; the description is the only help the model gets for that argument"),
  rule("For Millbrook and 20 minutes it returns exactly the free slots in the diary", async (dir) => {
    const r = await ok(dir);
    if (!r?.first || r.first.isError) return false;
    return JSON.stringify([...new Set(timesIn(r.first.text))].sort()) === JSON.stringify(r.truth);
  }, "call clinic.freeSlots({ site, date, length }) and put every start time in the text; try it with bun run try find_free_slots '{\"site\":\"millbrook\"}' --server <your folder>"),
  rule("It reads the live diary: a slot booked behind its back disappears from the next answer", async (dir) => {
    const r = await ok(dir);
    return Boolean(r?.after && !r.after.isError && !timesIn(r.after.text).includes("10:20") && timesIn(r.after.text).includes("11:40"));
  }, "ask clinic.freeSlots on every call; never copy the answer into your code"),
];
