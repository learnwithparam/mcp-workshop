// return-structured-results: find_free_slots and vaccines_due answer with structured content that
// matches their output schema, keep a short text summary, and stay short unless asked for more.
// The check calls each tool on fixture inputs and compares the slots with the diary itself.
import * as z from "zod/v4";
import { call, listTools, type ToolResult, withServer } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";

const MOST_CONCISE_TOKENS = 150;
const BUSY_DAY = { site: "eastgate", date: "2026-11-17", length: 30 };

type Tool = { name: string; outputSchema?: Record<string, unknown> };
type Slot = { vetId: string; start: string };
type FixtureCall = { tool: string; args: Record<string, unknown> };

// Ten calls: five of each tool, in both levels of detail.
const FIXTURE_CALLS: FixtureCall[] = [
  { tool: "find_free_slots", args: { site: "millbrook" } },
  { tool: "find_free_slots", args: { site: "millbrook", detail: "full" } },
  { tool: "find_free_slots", args: { ...BUSY_DAY, detail: "concise" } },
  { tool: "find_free_slots", args: { ...BUSY_DAY, detail: "full" } },
  { tool: "find_free_slots", args: { site: "harrow-lane", date: "2026-11-21" } },
  { tool: "vaccines_due", args: { patientId: "P-0001" } },
  { tool: "vaccines_due", args: { patientId: "P-0001", detail: "full" } },
  { tool: "vaccines_due", args: { patientId: "P-0042", detail: "concise" } },
  { tool: "vaccines_due", args: { patientId: "P-0042", detail: "full" } },
  { tool: "vaccines_due", args: { patientId: "P-0006" } },
];

const run = scenario(async (dir) =>
  withServer(dir, async ({ client, world }) => {
    const tools = (await listTools(client)).tools as Tool[];
    const results: ToolResult[] = [];
    for (const fixture of FIXTURE_CALLS) {
      results.push(await call(client, fixture.tool, fixture.args));
    }
    const diarySlots = world.freeSlots(BUSY_DAY);
    return { tools, results, diarySlots };
  }),
);

async function outcome(dir: string) {
  const result = await run(dir);
  return failed(result) ? undefined : result;
}

function schemaOf(tools: Tool[], name: string): Record<string, unknown> | undefined {
  return tools.find((tool) => tool.name === name)?.outputSchema;
}

function matchesSchema(result: ToolResult, schema: Record<string, unknown> | undefined): boolean {
  if (!schema || result.isError || result.structured === undefined) return false;
  const validator = z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
  return validator.safeParse(result.structured).success;
}

// A rough count that works for any model: about four characters make one token.
function estimatedTokens(result: ToolResult): number {
  const characters = result.text.length + JSON.stringify(result.structured ?? "").length;
  return Math.ceil(characters / 4);
}

function slotsIn(result: ToolResult | undefined): Slot[] {
  const structured = result?.structured as { slots?: Slot[] } | undefined;
  return structured?.slots ?? [];
}

function vaccinesIn(result: ToolResult | undefined): unknown[] {
  const structured = result?.structured as { vaccines?: unknown[] } | undefined;
  return structured?.vaccines ?? [];
}

export default [
  rule(
    "The server starts and answers an MCP client",
    async (dir) => (await outcome(dir)) !== undefined,
    'run "bun server.ts" in the problem folder and fix the first error it prints',
  ),
  rule(
    "find_free_slots and vaccines_due both declare an outputSchema",
    async (dir) => {
      const tools = (await outcome(dir))?.tools ?? [];
      return Boolean(schemaOf(tools, "find_free_slots") && schemaOf(tools, "vaccines_due"));
    },
    "add outputSchema: z.object({...}) next to inputSchema in each tool's config",
  ),
  rule(
    "Ten fixture calls return structuredContent that matches the tool's outputSchema",
    async (dir) => {
      const found = await outcome(dir);
      if (!found) return false;
      return found.results.every((result, i) =>
        matchesSchema(result, schemaOf(found.tools, FIXTURE_CALLS[i].tool)),
      );
    },
    "return structuredContent with exactly the fields your outputSchema names, and accept " +
      'detail: "concise" or "full"',
  ),
  rule(
    "Every one of those results also has a text summary",
    async (dir) => {
      const results = (await outcome(dir))?.results ?? [];
      return results.length > 0 && results.every((result) => result.text.trim().length > 0);
    },
    "keep a short text block in content; many clients show only the text",
  ),
  rule(
    "A concise find_free_slots answer stays under 150 tokens (Eastgate, 2026-11-17, 30 minutes)",
    async (dir) => {
      const concise = (await outcome(dir))?.results[2];
      return Boolean(concise && !concise.isError && estimatedTokens(concise) < MOST_CONCISE_TOKENS);
    },
    'when detail is "concise", return only the first 3 start times for each vet',
  ),
  rule(
    "A full find_free_slots answer lists every free slot the diary has",
    async (dir) => {
      const found = await outcome(dir);
      return Boolean(found && slotsIn(found.results[3]).length === found.diarySlots.length);
    },
    'when detail is "full", return every slot from clinic.freeSlots',
  ),
  rule(
    "Every slot in the structured result is really free in the diary",
    async (dir) => {
      const found = await outcome(dir);
      if (!found) return false;
      const freeTimes = new Set(found.diarySlots.map((slot) => `${slot.vetId} ${slot.start}`));
      const returned = [...slotsIn(found.results[2]), ...slotsIn(found.results[3])];
      return (
        returned.length > 0 &&
        returned.every((slot) => freeTimes.has(`${slot.vetId} ${slot.start}`))
      );
    },
    "build the slots from clinic.freeSlots, with vetId and start for each one",
  ),
  rule(
    "vaccines_due gives one entry per vaccine when concise, and every record when full (Pepper)",
    async (dir) => {
      const results = (await outcome(dir))?.results;
      return vaccinesIn(results?.[7]).length === 1 && vaccinesIn(results?.[8]).length === 2;
    },
    "Pepper has two cat flu records: concise keeps the latest due date, full keeps both",
  ),
];
