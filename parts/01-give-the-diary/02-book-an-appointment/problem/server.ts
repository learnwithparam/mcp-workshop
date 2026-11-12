// Your Harrow Lane MCP server. Check it with: bun run verify book-an-appointment
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { clinic } from "#clinic";

function createServer(): McpServer {
  const server = new McpServer({ name: "harrow-lane", version: "0.1.0" });

  server.registerTool(
    "find_free_slots",
    {
      description: "List free appointment start times at one Harrow Lane site, for each vet. Use it before booking an appointment.",
      inputSchema: z.object({
        site: z.enum(["harrow-lane", "millbrook", "eastgate"]).describe("Clinic site id: harrow-lane, millbrook or eastgate"),
        date: z.iso.date().optional().describe("Date as YYYY-MM-DD. Leave it out for the clinic's current date"),
        length: z.number().int().default(20).describe("Appointment length in minutes. Default 20"),
      }),
    },
    async ({ site, date, length }) => {
      const day = date ?? clinic.clock().date;
      const slots = clinic.freeSlots({ site, date: day, length });
      if (slots.length === 0) return { content: [{ type: "text", text: `No free ${length}-minute slots at ${site} on ${day}.` }] };
      const lines = slots.map((s) => `${s.start} with ${s.vet_name} (${s.vet_id})`);
      return { content: [{ type: "text", text: `Free ${length}-minute slots at ${site} on ${day}:\n${lines.join("\n")}` }] };
    },
  );

  // TODO: register a tool called book_appointment(patient_id, vet_id, date?, start, length, reason).
  // The PIMS will double-book a vet if you let it: before clinic.createAppointment, read the vet's
  // appointments with clinic.appointments({ vet_id, date }) and refuse a time that overlaps one.
  // Refuse by returning a result with isError: true, so the model can read why and try again.

  return server;
}

serveStdio(createServer);
console.error("harrow-lane server running on stdio"); // stderr is safe; stdout belongs to the protocol
