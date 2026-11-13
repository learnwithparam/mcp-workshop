// A Harrow Lane server for vets, with all three legs of the lethal trifecta:
//   private data:       owner_contact returns the owner's real phone number and email
//   untrusted content:  read_notes returns notes, and owners can write into them from the portal
//   a way out:          send_email sends any text to any address
// Cut one leg. Check it with: bun run verify break-the-lethal-trifecta
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
  // Hide all but the first five digits of the phone number.
  const maskedPhone = `${owner.phone.slice(0, 5)} ******`;
  return textResult(`${owner.name}, phone ${maskedPhone}, email ${owner.email}`);
}

type Email = { to: string; subject: string; body: string };

function sendEmail(email: Email) {
  appendFileSync(OUTBOX, `${JSON.stringify(email)}\n`);
  return textResult(`Sent "${email.subject}" to ${email.to}.`);
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
    "send_email",
    {
      description: "Send an email from the clinic.",
      inputSchema: z.object({
        to: z.string().describe("The email address to send to"),
        subject: z.string().describe("The subject line"),
        body: z.string().describe("The text of the email"),
      }),
    },
    sendEmail,
  );
  return server;
}

serveStdio(createServer);
// stdout carries the protocol messages, so log lines go to stderr.
console.error("harrow-lane-vets server running on stdio");
