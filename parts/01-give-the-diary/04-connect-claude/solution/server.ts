// Your Harrow Lane MCP server. Check it with: bun run verify connect-claude
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { clinic } from "#clinic";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const LENGTH_RULE = "length must be 10 to 60 minutes, in steps of 10";

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

  server.registerTool(
    "book_appointment",
    {
      description: "Book one appointment for a patient with a vet. It refuses a time that clashes with the vet's diary.",
      inputSchema: z.object({
        patient_id: z.string().describe("Patient id, for example P-0001"),
        vet_id: z.string().describe("Vet id, for example S-05"),
        date: z.iso.date().optional().describe("Date as YYYY-MM-DD. Leave it out for the clinic's current date"),
        start: z.string().regex(/^\d{2}:\d{2}$/).describe("Start time as HH:MM, for example 10:20"),
        length: z
          .number()
          .int()
          .min(10, { error: LENGTH_RULE })
          .max(60, { error: LENGTH_RULE })
          .multipleOf(10, { error: LENGTH_RULE })
          .default(20)
          .describe("Appointment length in minutes: 10 to 60, in steps of 10. Default 20"),
        reason: z.string().describe("Why the patient is coming in, for example Booster"),
      }),
    },
    async (a) => {
      const date = a.date ?? clinic.clock().date;
      const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

      if (!clinic.patient(a.patient_id)) {
        return fail(`No patient with patient_id "${a.patient_id}". Ids look like P-0001; ask for the pet's name and look it up.`);
      }
      const vet = clinic.staffMember(a.vet_id);
      if (!vet || (vet.role !== "vet" && vet.role !== "director")) {
        return fail(`No vet with vet_id "${a.vet_id}". Vet ids look like S-05; find_free_slots lists each vet's id.`);
      }
      const now = clinic.clock();
      if (date < now.date || (date === now.date && a.start < now.time)) {
        return fail(`The start ${date} ${a.start} is in the past. The clinic clock reads ${now.date} ${now.time}; pick a later start.`);
      }
      const hours = clinic.openingHours(vet.site, date);
      if (!hours) return fail(`${vet.site} is closed on ${date}. Pick another date; find_free_slots shows open times.`);
      if (a.start < hours.open || toMinutes(a.start) + a.length > toMinutes(hours.close)) {
        return fail(`${a.start} is outside ${vet.site} opening hours on ${date}: it opens at ${hours.open} and closes at ${hours.close}.`);
      }

      const start = toMinutes(a.start);
      const end = start + a.length;
      // Cancelled and no-show appointments stay in the diary but do not hold the vet's time.
      const clash = clinic
        .appointments({ vet_id: a.vet_id, date })
        .filter((x) => x.status === "booked" || x.status === "arrived")
        .find((x) => start < toMinutes(x.start) + x.length && toMinutes(x.start) < end);
      if (clash) {
        const free = clinic.freeSlots({ site: vet.site, date, length: a.length, vet_id: vet.id }).map((s) => s.start);
        return fail(`${vet.name} is booked at ${clash.start}, which clashes with ${a.start}. Free slots: ${free.slice(0, 6).join(", ") || "none on this date"}.`);
      }
      const appt = clinic.createAppointment({ ...a, date });
      return { content: [{ type: "text", text: `Booked ${appt.id}: ${appt.start} on ${appt.date}.` }] };
    },
  );

  return server;
}

serveStdio(createServer);
console.error("harrow-lane server running on stdio"); // stderr is safe; stdout belongs to the protocol
