// The Millbrook branch's diary server, upgraded to version 2 of the MCP TypeScript SDK.
// The codemod changed the imports, the error class and .tool() to registerTool. It could not
// read the old four-argument .tool() call, so the description and the input schema were fixed
// by hand. Check it with: bun run verify upgrade-a-v1-server
import { McpServer, ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { clinic } from "#clinic";

const SITES = ["harrow-lane", "millbrook", "eastgate"] as const;
// Most appointments are 20 minutes, so the model may leave the length out.
const WHOLE_MINUTES = z.number().int().default(20);

const server = new McpServer({ name: "millbrook-diary", version: "2.0.0" });

server.registerTool(
  "find_free_slots",
  {
    description:
      "List free appointment start times at one Harrow Lane site, for each vet. " +
      "Use it before booking an appointment.",
    // Version 2 takes a whole schema object, not a bare list of fields.
    inputSchema: z.object({
      site: z.enum(SITES).describe("Clinic site id: harrow-lane, millbrook or eastgate"),
      date: z.string().optional().describe("Date as YYYY-MM-DD. Leave it out for today"),
      length: WHOLE_MINUTES.describe("Appointment length in minutes. Default 20"),
    }),
  },
  async ({ site, date, length }) => {
    const day = date ?? clinic.clock().date;
    if (day < clinic.clock().date) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `The date ${day} is in the past.`);
    }
    const slots = clinic.freeSlots({ site, date: day, length });
    const lines = slots.map((slot) => `${slot.start} with ${slot.vetName} (${slot.vetId})`);
    const text = `Free ${length}-minute slots at ${site} on ${day}:\n${lines.join("\n")}`;
    return { content: [{ type: "text" as const, text }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout carries the protocol messages, so log lines go to stderr.
console.error("millbrook-diary server running on stdio");
