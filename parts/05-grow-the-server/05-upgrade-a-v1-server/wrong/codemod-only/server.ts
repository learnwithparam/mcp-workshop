// The diary server just after the codemod ran, with nothing fixed by hand. The codemod marked
// the one call it could not read, and that call is still wrong.

import { McpServer, ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { clinic } from "#clinic";

const SITES = ["harrow-lane", "millbrook", "eastgate"] as const;
// Most appointments are 20 minutes, so the model may leave the length out.
const WHOLE_MINUTES = z.number().int().default(20);

const server = new McpServer({ name: "millbrook-diary", version: "1.9.0" });

/* @mcp-codemod-error Could not verify the schema argument is a schema object.
   Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … }));
   no change is needed if it already is one. */
server.registerTool(
  "find_free_slots",
  {
    inputSchema:
      "List free appointment start times at one Harrow Lane site, for each vet. " +
      "Use it before booking an appointment.",
    annotations: {
      site: z.enum(SITES).describe("Clinic site id: harrow-lane, millbrook or eastgate"),
      date: z.string().optional().describe("Date as YYYY-MM-DD. Leave it out for today"),
      length: WHOLE_MINUTES.describe("Appointment length in minutes. Default 20"),
    },
  },
  async ({ site, date, length }) => {
    const day = date ?? clinic.clock().date;
    if (day < clinic.clock().date) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `The date ${day} is in the past.`);
    }
    const slots = clinic.freeSlots({ site, date: day, length });
    const lines = slots.map((slot) => `${slot.start} with ${slot.vetName} (${slot.vetId})`);
    const text = `Free ${length}-minute slots at ${site} on ${day}:\n${lines.join("\n")}`;
    return { content: [{ type: "text", text }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout carries the protocol messages, so log lines go to stderr.
console.error("millbrook-diary server running on stdio");
