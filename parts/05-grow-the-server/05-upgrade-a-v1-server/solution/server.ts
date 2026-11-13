// The Millbrook branch's diary server, upgraded to version 2 of the MCP TypeScript SDK.
// The codemod changed the imports, the error class and .tool() to registerTool. It could not
// read the old four-argument .tool() call, so the description and the input schema were fixed
// by hand. The codemod does not move a server to the 2026-07-28 protocol, so serveStdio replaced
// server.connect by hand too. Check it with: bun run verify upgrade-a-v1-server
import { McpServer, ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { clinic } from "#clinic";

const SITES = ["harrow-lane", "millbrook", "eastgate"] as const;
// Most appointments are 20 minutes, so the model may leave the length out.
const WHOLE_MINUTES = z.number().int().default(20);

// serveStdio asks for a function that builds the server, so it can serve both protocol versions.
function createServer(): McpServer {
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
  return server;
}

serveStdio(createServer);
// stdout carries the protocol messages, so log lines go to stderr.
console.error("millbrook-diary server running on stdio");
