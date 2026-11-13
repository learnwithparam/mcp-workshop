// A wrong answer: the right five tools, but every description opens with the same words.
// Check it with: bun run verify shape-tools-around-jobs
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { type Appointment, clinic, type Staff } from "#clinic";

// A tool answers with a list of content blocks. Ours is always one block of text.
// "as const" keeps the type exactly "text", the block type the SDK expects.
function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

// isError: true tells the model the call failed. The text tells it why, so it can try again.
function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

// ---- find_patient: turn what the caller says into a patient id ----

const findPatientInput = z.object({
  name: z.string().optional().describe("The pet's name, for example Biscuit"),
  ownerName: z.string().optional().describe("Part of the owner's name, for example Collins"),
  ownerPhone: z.string().optional().describe("The owner's phone number, for example 07700 900000"),
});

type FindPatientInput = z.infer<typeof findPatientInput>;

function findPatient(search: FindPatientInput) {
  if (!search.name && !search.ownerName && !search.ownerPhone) {
    return errorResult("Give at least one of name, ownerName or ownerPhone.");
  }
  const patients = clinic.findPatients(search);
  if (patients.length === 0) {
    return textResult("No patient matches. Try the owner's phone number.");
  }
  const lines = patients.map(
    (patient) =>
      `${patient.id} ${patient.name} (${patient.breed}, ${patient.homeSite}), ` +
      `owner ${patient.ownerName}`,
  );
  return textResult(lines.join("\n"));
}

// What the model reads about find_patient: when to use it and what it needs.
const findPatientTool = {
  description:
    "Use this tool to work with the Harrow Lane clinic diary. " +
    "Find a patient by pet name, owner name or owner phone. " +
    "Returns the patient ids that the booking and vaccine tools need.",
  inputSchema: findPatientInput,
};

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

// What the model reads about find_free_slots: when to use it and what it needs.
const findFreeSlotsTool = {
  description:
    "Use this tool to work with the Harrow Lane clinic diary. " +
    "List free appointment start times at one Harrow Lane site, for each vet. " +
    "Use it before booking an appointment.",
  inputSchema: findFreeSlotsInput,
};

// ---- book_appointment: write to the diary ----

const lengthRule = "length must be 10 to 60 minutes, in steps of 10";

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
    .min(10, { error: lengthRule })
    .max(60, { error: lengthRule })
    .multipleOf(10, { error: lengthRule })
    .default(20)
    .describe("Appointment length in minutes: 10 to 60, in steps of 10. Default 20"),
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

// `movingId` is the appointment being moved, if any: it must not clash with itself.
function findClash(
  booking: BookAppointmentInput,
  date: string,
  movingId?: string,
): Appointment | undefined {
  const vetsAppointments = clinic.appointments({ vetId: booking.vetId, date });
  // Cancelled and no-show appointments stay in the diary but do not hold the vet's time.
  const busyAppointments = vetsAppointments.filter(
    (appointment) =>
      appointment.id !== movingId &&
      (appointment.status === "booked" || appointment.status === "arrived"),
  );
  return busyAppointments.find((appointment) => overlaps(booking, appointment));
}

// The error text is all the model reads before it tries again, so each message below names
// what is wrong and says what to do next.

function unknownPatientError(patientId: string): string | undefined {
  if (clinic.patient(patientId)) {
    return undefined;
  }
  return (
    `No patient with patientId "${patientId}". ` +
    "Ids look like P-0001; ask for the pet's name and look it up."
  );
}

// Only vets and the director take appointments, so a nurse's id is not a vet id.
function findVet(vetId: string): Staff | undefined {
  const staffMember = clinic.staffMember(vetId);
  if (staffMember?.role === "vet" || staffMember?.role === "director") {
    return staffMember;
  }
  return undefined;
}

function startInThePastError(start: string, date: string): string | undefined {
  const now = clinic.clock();
  const isInThePast = date < now.date || (date === now.date && start < now.time);
  if (!isInThePast) {
    return undefined;
  }
  return (
    `The start ${date} ${start} is in the past. ` +
    `The clinic clock reads ${now.date} ${now.time}; pick a later start.`
  );
}

function outsideOpeningHoursError(
  booking: BookAppointmentInput,
  site: string,
  date: string,
): string | undefined {
  const hours = clinic.openingHours(site, date);
  if (!hours) {
    return `${site} is closed on ${date}. Pick another date; find_free_slots shows open times.`;
  }
  const end = minutesSinceMidnight(booking.start) + booking.length;
  if (booking.start < hours.open || end > minutesSinceMidnight(hours.close)) {
    return (
      `${booking.start} is outside ${site} opening hours on ${date}: ` +
      `it opens at ${hours.open} and closes at ${hours.close}.`
    );
  }
  return undefined;
}

// Real free times from the diary, so the model can offer one that will work.
function freeTimesFor(vet: Staff, date: string, length: number): string {
  const slots = clinic.freeSlots({ site: vet.site, date, length, vetId: vet.id });
  const firstTimes = slots.slice(0, 6).map((slot) => slot.start);
  return firstTimes.join(", ") || "none on this date";
}

function bookAppointment(booking: BookAppointmentInput) {
  const date = booking.date ?? clinic.clock().date;

  const patientError = unknownPatientError(booking.patientId);
  if (patientError) {
    return errorResult(patientError);
  }
  const vet = findVet(booking.vetId);
  if (!vet) {
    return errorResult(
      `No vet with vetId "${booking.vetId}". ` +
        "Vet ids look like S-05; find_free_slots lists each vet's id.",
    );
  }
  const timeError =
    startInThePastError(booking.start, date) ?? outsideOpeningHoursError(booking, vet.site, date);
  if (timeError) {
    return errorResult(timeError);
  }

  const clash = findClash(booking, date);
  if (clash) {
    const freeTimes = freeTimesFor(vet, date, booking.length);
    return errorResult(
      `${vet.name} is booked at ${clash.start}, which clashes with ${booking.start}. ` +
        `Free slots: ${freeTimes}.`,
    );
  }
  const appointment = clinic.createAppointment({ ...booking, date });
  return textResult(`Booked ${appointment.id}: ${appointment.start} on ${appointment.date}.`);
}

// What the model reads about book_appointment: when to use it and what it needs.
const bookAppointmentTool = {
  description:
    "Use this tool to work with the Harrow Lane clinic diary. " +
    "Book one appointment for a patient with a vet. " +
    "It refuses a time that clashes with the vet's diary.",
  inputSchema: bookAppointmentInput,
};

// ---- move_appointment: the same clash rules as booking ----

const moveAppointmentInput = z.object({
  appointmentId: z.string().describe("Appointment id, for example A-00981"),
  start: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .describe("New start time as HH:MM, for example 15:00"),
  date: z.iso.date().optional().describe("New date as YYYY-MM-DD. Leave it out to keep the date"),
  vetId: z.string().optional().describe("New vet id, only if the vet changes"),
});

type MoveAppointmentInput = z.infer<typeof moveAppointmentInput>;

function moveAppointment(move: MoveAppointmentInput) {
  const current = clinic.appointment(move.appointmentId);
  if (current?.status !== "booked") {
    return errorResult(`No booked appointment with appointmentId "${move.appointmentId}".`);
  }
  const vet = findVet(move.vetId ?? current.vetId);
  if (!vet) {
    return errorResult(`No vet with vetId "${move.vetId}". Vet ids look like S-05.`);
  }
  const date = move.date ?? current.date;
  const newTime = { ...current, vetId: vet.id, start: move.start };
  const clash = findClash(newTime, date, current.id);
  if (clash) {
    const freeTimes = freeTimesFor(vet, date, current.length);
    return errorResult(
      `${vet.name} is booked at ${clash.start}, which clashes with ${move.start}. ` +
        `Free slots: ${freeTimes}.`,
    );
  }
  const moved = clinic.moveAppointment(current.id, { vetId: vet.id, date, start: move.start });
  return textResult(`Moved ${current.id} to ${moved?.start} on ${moved?.date} with ${vet.name}.`);
}

// What the model reads about move_appointment: when to use it and what it needs.
const moveAppointmentTool = {
  description:
    "Use this tool to work with the Harrow Lane clinic diary. " +
    "Move a booked appointment to a new start time, date or vet. " +
    "It refuses a clash and lists free slots.",
  inputSchema: moveAppointmentInput,
};

// ---- vaccines_due: one line per vaccine, never the whole history ----

const vaccinesDueInput = z.object({
  patientId: z.string().describe("Patient id from find_patient, for example P-0001"),
});

// A patient can have several records for one vaccine. Only the latest due date counts.
function latestDueDates(patientId: string): { vaccine: string; due: string }[] {
  const latestDue = new Map<string, string>();
  for (const vaccination of clinic.vaccinations(patientId)) {
    const knownDue = latestDue.get(vaccination.vaccine);
    if (knownDue === undefined || knownDue < vaccination.due) {
      latestDue.set(vaccination.vaccine, vaccination.due);
    }
  }
  const dueDates = [...latestDue].map(([vaccine, due]) => ({ vaccine, due }));
  return dueDates.sort((first, second) => first.due.localeCompare(second.due));
}

function vaccinesDue({ patientId }: z.infer<typeof vaccinesDueInput>) {
  const patient = clinic.patient(patientId);
  if (!patient) {
    return errorResult(`No patient with patientId "${patientId}". Use find_patient first.`);
  }
  const dueDates = latestDueDates(patientId);
  if (dueDates.length === 0) {
    return textResult(`${patient.name} has no vaccinations on record.`);
  }
  const lines = dueDates.map((dueDate) => `${dueDate.vaccine} due ${dueDate.due}`);
  return textResult(`${patient.name}: ${lines.join("; ")}`);
}

// What the model reads about vaccines_due: when to use it and what it needs.
const vaccinesDueTool = {
  description:
    "Use this tool to work with the Harrow Lane clinic diary. " +
    "Show when each of a patient's vaccines is next due, soonest first. " +
    "Use it to offer a booster.",
  inputSchema: vaccinesDueInput,
};

// ---- the server: one tool for each front-desk job ----

export function createServer(): McpServer {
  const server = new McpServer({ name: "harrow-lane", version: "0.2.0" });
  server.registerTool("find_patient", findPatientTool, findPatient);
  server.registerTool("find_free_slots", findFreeSlotsTool, findFreeSlots);
  server.registerTool("book_appointment", bookAppointmentTool, bookAppointment);
  server.registerTool("move_appointment", moveAppointmentTool, moveAppointment);
  server.registerTool("vaccines_due", vaccinesDueTool, vaccinesDue);
  return server;
}

// Serve over stdio only when this file is run, so a test can import createServer.
if (import.meta.main) {
  serveStdio(createServer);
  // stdout carries the protocol messages, so log lines go to stderr.
  console.error("harrow-lane server running on stdio");
}
