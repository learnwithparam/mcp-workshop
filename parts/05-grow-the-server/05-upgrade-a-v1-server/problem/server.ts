// The Millbrook branch's old diary server, written for version 1 of the MCP TypeScript SDK.
// It no longer starts: this repo has SDK version 2, and the old package
// "@modelcontextprotocol/sdk" is not installed. Upgrade it with the codemod, then fix what the
// codemod marks. Check it with: bun run verify upgrade-a-v1-server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { clinic } from "#clinic";

const SITES = ["harrow-lane", "millbrook", "eastgate"] as const;
// Most appointments are 20 minutes, so the model may leave the length out.
const WHOLE_MINUTES = z.number().int().default(20);

const server = new McpServer({ name: "millbrook-diary", version: "1.9.0" });

server.tool(
  "find_free_slots",
  "List free appointment start times at one Harrow Lane site, for each vet. " +
    "Use it before booking an appointment.",
  {
    site: z.enum(SITES).describe("Clinic site id: harrow-lane, millbrook or eastgate"),
    date: z.string().optional().describe("Date as YYYY-MM-DD. Leave it out for today"),
    length: WHOLE_MINUTES.describe("Appointment length in minutes. Default 20"),
  },
  async ({ site, date, length }) => {
    const day = date ?? clinic.clock().date;
    if (day < clinic.clock().date) {
      throw new McpError(ErrorCode.InvalidParams, `The date ${day} is in the past.`);
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
