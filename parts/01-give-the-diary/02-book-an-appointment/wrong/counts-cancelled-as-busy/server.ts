// Your Harrow Lane MCP server. Check it with: bun run verify book-an-appointment
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { type Appointment, clinic } from "#clinic";

// A tool answers with a list of content blocks. Ours is always one block of text.
// "as const" keeps the type exactly "text", the block type the SDK expects.
function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

// isError: true tells the model the call failed. The text tells it why, so it can try again.
function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

// ---- find_free_slots: read the diary ----

const findFreeSlotsInput = z.object({
  site: z
    .enum(["harrow-lane", "millbrook", "eastgate"])
    .describe("Clinic site id: harrow-lane, millbrook or eastgate"),
  date: z.iso
    .date()
    .optional()
    .describe("Date as YYYY-MM-DD. Leave it out for the clinic's current date"),
  length: z
    .number()
    .int()
    // Most appointments are 20 minutes, so the model may leave length out.
    .default(20)
    .describe("Appointment length in minutes. Default 20"),
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

// ---- book_appointment: write to the diary ----

const bookAppointmentInput = z.object({
  patientId: z.string().describe("Patient id, for example P-0001"),
  vetId: z.string().describe("Vet id, for example S-05"),
  date: z.iso
    .date()
    .optional()
    .describe("Date as YYYY-MM-DD. Leave it out for the clinic's current date"),
  start: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .describe("Start time as HH:MM, for example 10:20"),
  length: z
    .number()
    .int()
    // Most appointments are 20 minutes, so the model may leave length out.
    .default(20)
    .describe("Appointment length in minutes. Default 20"),
  reason: z.string().describe("Why the patient is coming in, for example Booster"),
});

type BookAppointmentInput = z.infer<typeof bookAppointmentInput>;

// Turns a clock time such as "10:20" into a number we can add to and compare.
function minutesSinceMidnight(clockTime: string): number {
  const [hours, minutes] = clockTime.split(":").map(Number);
  return hours * 60 + minutes;
}

// Two appointments clash when each one starts before the other one ends.
function overlaps(booking: BookAppointmentInput, appointment: Appointment): boolean {
  const start = minutesSinceMidnight(booking.start);
  const end = start + booking.length;
  const otherStart = minutesSinceMidnight(appointment.start);
  const otherEnd = otherStart + appointment.length;
  return start < otherEnd && otherStart < end;
}

function findClash(booking: BookAppointmentInput, date: string): Appointment | undefined {
  const vetsAppointments = clinic.appointments({ vetId: booking.vetId, date });
  return vetsAppointments.find((appointment) => overlaps(booking, appointment));
}

function bookAppointment(booking: BookAppointmentInput) {
  const date = booking.date ?? clinic.clock().date;

  const clash = findClash(booking, date);
  if (clash) {
    return errorResult(`Clash: the vet is already booked at ${clash.start}.`);
  }
  const appointment = clinic.createAppointment({ ...booking, date });
  return textResult(`Booked ${appointment.id}: ${appointment.start} on ${appointment.date}.`);
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

  server.registerTool(
    "book_appointment",
    {
      description:
        "Book one appointment for a patient with a vet. " +
        "It refuses a time that clashes with the vet's diary.",
      inputSchema: bookAppointmentInput,
    },
    bookAppointment,
  );

  return server;
}

serveStdio(createServer);
// stdout carries the protocol messages, so log lines go to stderr.
console.error("harrow-lane server running on stdio");
