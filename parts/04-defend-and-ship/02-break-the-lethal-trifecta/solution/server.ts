// A Harrow Lane server for vets, with one leg of the lethal trifecta cut: the way out.
//   private data:       owner_contact returns the owner's real phone number and email
//   untrusted content:  read_notes returns notes, and owners can write into them from the portal
//   a way out:          CUT. send_email is gone. send_reminder writes one fixed message, and only
//                       to the owner on file, so no text the model writes can leave the clinic.
// Check it with: bun run verify break-the-lethal-trifecta
import { appendFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { clinic } from "#clinic";

// Sent emails are written here, one JSON line each. The check reads this file.
const OUTBOX = process.env.OUTBOX ?? "outbox.jsonl";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

const patientIdInput = z.object({
  patientId: z.string().describe("Patient id, for example P-0042"),
});

function findPatient({ name }: { name: string }) {
  const patients = clinic.findPatients({ name });
  const lines = patients.map((patient) => `${patient.id} ${patient.name} (${patient.breed})`);
  return textResult(lines.join("\n") || "No patient matches.");
}

function readNotes({ patientId }: { patientId: string }) {
  const notes = clinic.clinicalNotes(patientId).slice(0, 3);
  const lines = notes.map((note) => `${note.date} ${note.soap} Plan: ${note.plan}`);
  return textResult(lines.join("\n") || "No notes.");
}

function ownerContact({ patientId }: { patientId: string }) {
  const patient = clinic.patient(patientId);
  const owner = patient && clinic.owner(patient.ownerId);
  if (!owner) return textResult(`No patient with patientId "${patientId}".`);
  return textResult(`${owner.name}, phone ${owner.phone}, email ${owner.email}`);
}

// The model chooses only which appointment. The address and the words come from the clinic.
function sendReminder({ appointmentId }: { appointmentId: string }) {
  const appointment = clinic.appointment(appointmentId);
  const patient = appointment && clinic.patient(appointment.patientId);
  const owner = patient && clinic.owner(patient.ownerId);
  if (!appointment || !patient || !owner) {
    return textResult(`No appointment with appointmentId "${appointmentId}".`);
  }
  const reminder = {
    to: owner.email,
    subject: `Reminder: ${patient.name} at Harrow Lane Veterinary`,
    body: `${patient.name} is booked on ${appointment.date} at ${appointment.start}.`,
  };
  appendFileSync(OUTBOX, `${JSON.stringify(reminder)}\n`);
  return textResult(`Sent a reminder for ${appointmentId} to the owner on file.`);
}

function createServer(): McpServer {
  const server = new McpServer({ name: "harrow-lane-vets", version: "0.4.0" });
  server.registerTool(
    "find_patient",
    {
      description: "Find a patient by the pet's name. Returns patient ids.",
      inputSchema: z.object({ name: z.string().describe("The pet's name, for example Pepper") }),
    },
    findPatient,
  );
  server.registerTool(
    "read_notes",
    {
      description: "Read a patient's three latest clinical notes, newest first.",
      inputSchema: patientIdInput,
    },
    readNotes,
  );
  server.registerTool(
    "owner_contact",
    {
      description: "Show the owner's name, phone number and email, to call about the pet.",
      inputSchema: patientIdInput,
    },
    ownerContact,
  );
  server.registerTool(
    "send_reminder",
    {
      description:
        "Email the owner on file a fixed reminder for one appointment. " +
        "You cannot choose the address or the words.",
      inputSchema: z.object({
        appointmentId: z.string().describe("Appointment id, for example A-00012"),
      }),
    },
    sendReminder,
  );
  return server;
}

serveStdio(createServer);
// stdout carries the protocol messages, so log lines go to stderr.
console.error("harrow-lane-vets server running on stdio");
