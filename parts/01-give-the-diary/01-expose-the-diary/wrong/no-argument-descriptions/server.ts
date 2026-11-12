// Your Harrow Lane MCP server. Check it with: bun run verify expose-the-diary
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { clinic } from "#clinic";

// A tool answers with a list of content blocks. Ours is always one block of text.
// "as const" keeps the type exactly "text", the block type the SDK expects.
function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

// ---- find_free_slots: read the diary ----

const findFreeSlotsInput = z.object({
  site: z.enum(["harrow-lane", "millbrook", "eastgate"]),
  date: z.iso.date().optional(),
  // Most appointments are 20 minutes, so the model may leave length out.
  length: z.number().int().default(20),
});

// The arguments the tool receives, worked out from the schema above.
type FindFreeSlotsInput = z.infer<typeof findFreeSlotsInput>;

function findFreeSlots({ site, date, length }: FindFreeSlotsInput) {
  // No date means today, on the clinic's own clock.
  const day = date ?? clinic.clock().date;
  const slots = clinic.freeSlots({ site, date: day, length });
  if (slots.length === 0) {
    return textResult(`No free ${length}-minute slots at ${site} on ${day}.`);
  }
  const lines = slots.map((slot) => `${slot.start} with ${slot.vetName} (${slot.vetId})`);
  return textResult(`Free ${length}-minute slots at ${site} on ${day}:\n${lines.join("\n")}`);
}

// ---- the server: give each tool a name and a description the model reads ----

function createServer(): McpServer {
  const server = new McpServer({ name: "harrow-lane", version: "0.1.0" });

  server.registerTool(
    "find_free_slots",
    {
      description:
        "List free appointment start times at one Harrow Lane site, for each vet. " +
        "Use it before booking an appointment.",
      inputSchema: findFreeSlotsInput,
    },
    findFreeSlots,
  );

  return server;
}

serveStdio(createServer);
// stdout carries the protocol messages, so log lines go to stderr.
console.error("harrow-lane server running on stdio");
