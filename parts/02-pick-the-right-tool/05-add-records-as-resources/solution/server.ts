// Your Harrow Lane MCP server: five tools, each shaped around one front-desk job.
// find_free_slots and vaccines_due return structured results as well as a short text summary.
// Every tool says, in its annotations, whether it changes the diary.
// Each patient's summary is also a resource, a record the host can read and show by its URI.
// Check it with: bun run verify add-records-as-resources
import { McpServer, ResourceNotFoundError, ResourceTemplate } from "@modelcontextprotocol/server";
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
  // A link to each patient's summary, so the host can open the record without another tool.
  const links = patients.map((patient) => ({
    type: "resource_link" as const,
    uri: summaryUri(patient.id),
    name: `${patient.name} (${patient.id})`,
    mimeType: "application/json",
  }));
  return { content: [{ type: "text" as const, text: lines.join("\n") }, ...links] };
}

// What the model reads about find_patient: when to use it and what it needs.
const findPatientTool = {
  description:
    "Find a patient by pet name, owner name or owner phone. " +
    "Returns the patient ids that the booking and vaccine tools need.",
  inputSchema: findPatientInput,
  annotations: { readOnlyHint: true },
};

// ---- find_free_slots: read the diary ----

// "concise" keeps answers short for the model. "full" is there when it really needs every time.
const DETAIL = z
  .enum(["concise", "full"])
  .default("concise")
  .describe("concise: a short answer, the usual choice. full: every record");

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
  detail: DETAIL,
});

// The shape of the structured result. The SDK checks every result against it.
const freeSlotsOutput = z.object({
  site: z.string(),
  date: z.string(),
  length: z.number(),
  slots: z.array(z.object({ vetId: z.string(), vetName: z.string(), start: z.string() })),
});

// The arguments the tool receives, worked out from the schema above.
type FindFreeSlotsInput = z.infer<typeof findFreeSlotsInput>;
type Slot = z.infer<typeof freeSlotsOutput>["slots"][number];

const CONCISE_SLOTS_PER_VET = 3;

// The first few start times for each vet: enough to offer a choice on the phone.
function firstSlotsForEachVet(slots: Slot[]): Slot[] {
  const countByVet = new Map<string, number>();
  return slots.filter((slot) => {
    const count = countByVet.get(slot.vetId) ?? 0;
    countByVet.set(slot.vetId, count + 1);
    return count < CONCISE_SLOTS_PER_VET;
  });
}

// One line for each vet, such as "Dr Sam Reyes (S-05): 10:20, 11:40".
function startTimesByVet(slots: Slot[]): string {
  const startsByVet = new Map<string, string[]>();
  for (const slot of slots) {
    const vetLabel = `${slot.vetName} (${slot.vetId})`;
    const starts = startsByVet.get(vetLabel) ?? [];
    startsByVet.set(vetLabel, [...starts, slot.start]);
  }
  const lines = [...startsByVet].map(([vetLabel, starts]) => `${vetLabel}: ${starts.join(", ")}`);
  return lines.join("\n");
}

function findFreeSlots({ site, date, length, detail }: FindFreeSlotsInput) {
  // No date means today, on the clinic's own clock.
  const day = date ?? clinic.clock().date;
  const freeSlots = clinic.freeSlots({ site, date: day, length });
  const allSlots = freeSlots.map((slot) => ({
    vetId: slot.vetId,
    vetName: slot.vetName,
    start: slot.start,
  }));
  let slots = allSlots;
  if (detail === "concise") {
    slots = firstSlotsForEachVet(allSlots);
  }
  let summary = `No free ${length}-minute slots at ${site} on ${day}.`;
  if (slots.length > 0) {
    summary = startTimesByVet(slots);
  }
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: { site, date: day, length, slots },
  };
}

// What the model reads about find_free_slots: when to use it and what it needs.
const findFreeSlotsTool = {
  description:
    "List free appointment start times at one Harrow Lane site, for each vet. " +
    "Use it before booking an appointment.",
  inputSchema: findFreeSlotsInput,
  outputSchema: freeSlotsOutput,
  annotations: { readOnlyHint: true },
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
    "Book one appointment for a patient with a vet. " +
    "It refuses a time that clashes with the vet's diary.",
  inputSchema: bookAppointmentInput,
  // Booking twice makes two appointments, so it is not idempotent. It adds, it never removes.
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
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
    "Move a booked appointment to a new start time, date or vet. " +
    "It refuses a clash and lists free slots.",
  inputSchema: moveAppointmentInput,
  // Moving to the same time twice leaves the diary as one move did.
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
};

// ---- vaccines_due: one line per vaccine, unless the model asks for the full history ----

const vaccinesDueInput = z.object({
  patientId: z.string().describe("Patient id from find_patient, for example P-0001"),
  detail: DETAIL,
});

const vaccinesOutput = z.object({
  patientId: z.string(),
  name: z.string(),
  vaccines: z.array(
    z.object({ vaccine: z.string(), due: z.string(), given: z.string().optional() }),
  ),
});

type Vaccine = z.infer<typeof vaccinesOutput>["vaccines"][number];

// A patient can have several records for one vaccine. Only the latest due date counts.
function latestDueDates(patientId: string): Vaccine[] {
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

// Every vaccination record, with the date it was given.
function wholeHistory(patientId: string): Vaccine[] {
  const records = clinic.vaccinations(patientId);
  return records.map((record) => ({
    vaccine: record.vaccine,
    due: record.due,
    given: record.given,
  }));
}

function vaccinesDue({ patientId, detail }: z.infer<typeof vaccinesDueInput>) {
  const patient = clinic.patient(patientId);
  if (!patient) {
    return errorResult(`No patient with patientId "${patientId}". Use find_patient first.`);
  }
  let vaccines = latestDueDates(patientId);
  if (detail === "full") {
    vaccines = wholeHistory(patientId);
  }
  const lines = vaccines.map((vaccine) => `${vaccine.vaccine} due ${vaccine.due}`);
  let summary = `${patient.name}: ${lines.join("; ")}`;
  if (vaccines.length === 0) {
    summary = `${patient.name} has no vaccinations on record.`;
  }
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: { patientId, name: patient.name, vaccines },
  };
}

// What the model reads about vaccines_due: when to use it and what it needs.
const vaccinesDueTool = {
  description:
    "Show when each of a patient's vaccines is next due, soonest first. " +
    "Use it to offer a booster.",
  inputSchema: vaccinesDueInput,
  outputSchema: vaccinesOutput,
  annotations: { readOnlyHint: true },
};

// ---- the patient summary: a record the host can read by its URI ----

function summaryUri(patientId: string): string {
  return `clinic://patients/${patientId}/summary`;
}

const patientSummaryTemplate = new ResourceTemplate("clinic://patients/{patientId}/summary", {
  // We never list every patient: there are 600, and the host only needs the ones it found.
  list: undefined,
});

const patientSummaryConfig = {
  title: "Patient summary",
  description: "Species, breed, alerts and vaccines due for one patient. No owner contact details.",
  mimeType: "application/json",
};

// The summary leaves out the owner's phone and email: the front desk does not need them here.
function readPatientSummary(uri: URL, variables: { patientId?: string | string[] }) {
  const patientId = String(variables.patientId);
  const patient = clinic.patient(patientId);
  if (!patient) {
    throw new ResourceNotFoundError(uri.toString(), `No patient with patientId "${patientId}".`);
  }
  const summary = {
    patientId: patient.id,
    name: patient.name,
    species: patient.species,
    breed: patient.breed,
    homeSite: patient.homeSite,
    alerts: patient.alerts,
    vaccinesDue: latestDueDates(patient.id),
  };
  const text = JSON.stringify(summary, null, 2);
  return { contents: [{ uri: uri.toString(), mimeType: "application/json", text }] };
}

// ---- prepare_discharge_note: a prompt the person picks, with the record filled in ----

const dischargeNoteArguments = z.object({
  patientId: z.string().describe("Patient id, for example P-0001"),
});

function prepareDischargeNote({ patientId }: z.infer<typeof dischargeNoteArguments>) {
  const patient = clinic.patient(patientId);
  const name = patient?.name ?? patientId;
  const request =
    `Write a short discharge note for ${name} (${patientId}) for the owner to take home. ` +
    "Use plain words. Mention the vaccines that are due next. Do not include any clinical notes.";
  return {
    messages: [
      { role: "user" as const, content: { type: "text" as const, text: request } },
      {
        role: "user" as const,
        content: { type: "resource_link" as const, uri: summaryUri(patientId), name },
      },
    ],
  };
}

const dischargeNoteConfig = {
  title: "Prepare a discharge note",
  description: "Draft a short, plain discharge note for a patient's owner.",
  argsSchema: dischargeNoteArguments,
};

// ---- the server: one tool for each front-desk job ----

export function createServer(): McpServer {
  const server = new McpServer({ name: "harrow-lane", version: "0.2.0" });
  server.registerTool("find_patient", findPatientTool, findPatient);
  server.registerTool("find_free_slots", findFreeSlotsTool, findFreeSlots);
  server.registerTool("book_appointment", bookAppointmentTool, bookAppointment);
  server.registerTool("move_appointment", moveAppointmentTool, moveAppointment);
  server.registerTool("vaccines_due", vaccinesDueTool, vaccinesDue);
  server.registerResource(
    "patient-summary",
    patientSummaryTemplate,
    patientSummaryConfig,
    readPatientSummary,
  );
  server.registerPrompt("prepare_discharge_note", dischargeNoteConfig, prepareDischargeNote);
  return server;
}

// Serve over stdio only when this file is run, so a test can import createServer.
if (import.meta.main) {
  serveStdio(createServer);
  // stdout carries the protocol messages, so log lines go to stderr.
  console.error("harrow-lane server running on stdio");
}
