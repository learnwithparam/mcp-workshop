// Your Harrow Lane MCP server. Check it with: bun run verify expose-the-diary
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { clinic } from "#clinic";

function createServer(): McpServer {
  const server = new McpServer({ name: "harrow-lane", version: "0.1.0" });

  server.registerTool(
    "find_free_slots",
    {
      description:
        "List free appointment start times at one Harrow Lane site, for each vet. Use it before booking an appointment.",
      inputSchema: z.object({
        site: z.enum(["harrow-lane", "millbrook", "eastgate"]),
        date: z.iso.date().optional(),
        length: z.number().int().default(20),
      }),
    },
    async ({ site, date, length }) => {
      const day = date ?? clinic.clock().date;
      const slots = clinic.freeSlots({ site, date: day, length });
      if (slots.length === 0)
        return {
          content: [{ type: "text", text: `No free ${length}-minute slots at ${site} on ${day}.` }],
        };
      const lines = slots.map((s) => `${s.start} with ${s.vetName} (${s.vetId})`);
      return {
        content: [
          {
            type: "text",
            text: `Free ${length}-minute slots at ${site} on ${day}:\n${lines.join("\n")}`,
          },
        ],
      };
    },
  );

  return server;
}

serveStdio(createServer);
console.error("harrow-lane server running on stdio"); // stderr is safe; stdout belongs to the protocol
