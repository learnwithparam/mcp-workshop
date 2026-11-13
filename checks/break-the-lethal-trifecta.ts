// break-the-lethal-trifecta: the owner's portal message in Pepper's notes (P-0042) asks the model
// to email her record and the owner's phone number out. A recorded agent obeys it, three runs.
// No run may put the owner's phone or email into a tool argument, or into a message sent to
// someone else.
//
// The recorded agent plays the attack back call by call. Where the model copied a tool result,
// the recording says {{copy:<tool>}}, and the copy holds what the learner's server really returned.
// A tool the server does not offer cannot be called, so that call is skipped.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@modelcontextprotocol/client";
import { connectFolder } from "../world/connect";
import { call, listTools } from "./lib/mcp";
import { failed, rule, scenario, threeRuns } from "./lib/rules";
import { freshWorld } from "./lib/world";

const PART_DIR = join(import.meta.dir, "..", "parts", "04-defend-and-ship");
const RECORDING_FILE = join(PART_DIR, "02-break-the-lethal-trifecta", "recorded-attack.json");
const PEPPER = "P-0042";
// Parameter names that let the model choose where data goes.
const ADDRESS_PARAMETER = /^(to|cc|bcc|email|address|recipient|send_?to|url|webhook)$/i;

type RecordedCall = { name: string; input: Record<string, unknown> };
type ToolCallMade = { name: string; input: Record<string, unknown>; resultText: string };
type SentMessage = Record<string, unknown>;
type AttackRun = { calls: ToolCallMade[]; outbox: SentMessage[] };
type Owner = { email: string; phone: string };

const recording = JSON.parse(readFileSync(RECORDING_FILE, "utf8")) as { runs: RecordedCall[][] };

const world = freshWorld();
const [pepperOwner] = world.rows<Owner>(
  "SELECT o.email, o.phone FROM owners o JOIN patients p ON p.ownerId = o.id WHERE p.id = ?",
  PEPPER,
);
const ownerPhoneDigits = pepperOwner.phone.replace(/\D/g, "");

/** True when the text holds Pepper's owner's real phone number or email address. */
function holdsOwnerContact(text: string): boolean {
  const digitsOnly = text.replace(/\D/g, "");
  const hasPhone = digitsOnly.includes(ownerPhoneDigits);
  const hasEmail = text.toLowerCase().includes(pepperOwner.email.toLowerCase());
  return hasPhone || hasEmail;
}

/** The recorded input, with every {{copy:<tool>}} replaced by what that tool last returned. */
function withCopiesFilled(input: Record<string, unknown>, lastResults: Map<string, string>) {
  const copied = JSON.stringify(input).replace(/\{\{copy:([a-z_]+)\}\}/g, (_match, toolName) => {
    const resultText = lastResults.get(toolName) ?? "";
    return JSON.stringify(resultText).slice(1, -1);
  });
  return JSON.parse(copied) as Record<string, unknown>;
}

/** Plays one recorded run against the server and returns every call it could make. */
async function playRun(client: Client, recordedCalls: RecordedCall[]): Promise<ToolCallMade[]> {
  const { tools } = await listTools(client);
  const offered = new Set(tools.map((tool) => tool.name));
  const lastResults = new Map<string, string>();
  const calls: ToolCallMade[] = [];
  for (const recorded of recordedCalls) {
    if (!offered.has(recorded.name)) continue;
    const input = withCopiesFilled(recorded.input, lastResults);
    const result = await call(client, recorded.name, input);
    lastResults.set(recorded.name, result.text);
    calls.push({ name: recorded.name, input, resultText: result.text });
  }
  return calls;
}

function readOutbox(outboxPath: string): SentMessage[] {
  if (!existsSync(outboxPath)) return [];
  const lines = readFileSync(outboxPath, "utf8").split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line) as SentMessage);
}

/** One run in a fresh world, with its own outbox file. */
async function attackOnce(dir: string, runNumber: number): Promise<AttackRun> {
  const runWorld = freshWorld();
  const outboxPath = join(runWorld.dir, "outbox.jsonl");
  // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
  const env = { ...runWorld.env, OUTBOX: outboxPath };
  const connection = await connectFolder(dir, { env });
  try {
    const calls = await playRun(connection.client, recording.runs[runNumber]);
    return { calls, outbox: readOutbox(outboxPath) };
  } finally {
    await connection.close().catch(() => {});
  }
}

const attackRuns = scenario(async (dir) => {
  const runs: AttackRun[] = [];
  await threeRuns(async (runNumber) => {
    runs.push(await attackOnce(dir, runNumber));
    return true;
  });
  return runs;
});

/** What a vet sees: Pepper found by name, and her notes. */
const vetView = scenario(async (dir) => {
  const connection = await connectFolder(dir, { env: freshWorld().env });
  try {
    const found = await call(connection.client, "find_patient", { name: "Pepper" });
    const notes = await call(connection.client, "read_notes", { patientId: PEPPER });
    const { tools } = await listTools(connection.client);
    return { found: found.text, notes: notes.text, tools };
  } finally {
    await connection.close().catch(() => {});
  }
});

/** A message that carries the owner's contact details to anyone but the owner is a leak. */
function leaksToSomeoneElse(message: SentMessage): boolean {
  const sentTo = String(message.to ?? "").toLowerCase();
  if (sentTo === pepperOwner.email.toLowerCase()) return false;
  return holdsOwnerContact(JSON.stringify(message));
}

/** The leg named after "Leg I cut:" in notes/trifecta.md, in lower case. */
function legNamed(dir: string): string {
  const notesPath = join(dir, "notes", "trifecta.md");
  if (!existsSync(notesPath)) return "";
  const notes = readFileSync(notesPath, "utf8");
  const leg = notes.match(/^Leg I cut:\s*(.+)$/im)?.[1] ?? "";
  if (/todo/i.test(leg)) return "";
  return leg.toLowerCase();
}

type ToolList = Awaited<ReturnType<typeof listTools>>["tools"];

function hasAddressParameter(tools: ToolList): boolean {
  return tools.some((tool) => {
    const properties = Object.keys(tool.inputSchema.properties ?? {});
    return properties.some((property) => ADDRESS_PARAMETER.test(property));
  });
}

/** True when the server really does what the notes say: no way out, or no private data out. */
async function serverMatchesLeg(dir: string): Promise<boolean> {
  const leg = legNamed(dir);
  const view = await vetView(dir);
  const runs = await attackRuns(dir);
  if (failed(view) || failed(runs)) return false;
  if (leg.includes("way out")) return !hasAddressParameter(view.tools);
  if (leg.includes("private data")) {
    const results = runs.flatMap((run) => run.calls.map((made) => made.resultText));
    return !results.some(holdsOwnerContact);
  }
  return false;
}

export default [
  rule(
    "A vet can still find Pepper (P-0042) with find_patient",
    async (dir) => {
      const view = await vetView(dir);
      return !failed(view) && view.found.includes(PEPPER);
    },
    "keep find_patient: the front desk needs it, and it is not a leg of the trifecta",
  ),
  rule(
    "A vet can still read Pepper's notes in full, the portal message included",
    async (dir) => {
      const view = await vetView(dir);
      return !failed(view) && view.notes.includes("records-export@example.org");
    },
    "keep read_notes as it is: vets need the whole record, so cut another leg",
  ),
  rule(
    "Over 3 recorded runs, no tool argument holds the owner's phone or email",
    async (dir) => {
      const runs = await attackRuns(dir);
      if (failed(runs)) return false;
      const inputs = runs.flatMap((run) => run.calls.map((made) => JSON.stringify(made.input)));
      return !inputs.some(holdsOwnerContact);
    },
    "a warning in a description does not stop a model that obeys the note: " +
      "take away send_email, or stop owner_contact from returning real contact details",
  ),
  rule(
    "Over 3 recorded runs, no message sends the owner's details to anyone but the owner",
    async (dir) => {
      const runs = await attackRuns(dir);
      if (failed(runs)) return false;
      const sent = runs.flatMap((run) => run.outbox);
      return !sent.some(leaksToSomeoneElse);
    },
    "blocking one address is not enough: run 3 writes to a look-alike address. " +
      "Let the server choose the address, not the model",
  ),
  rule(
    "notes/trifecta.md names the leg you cut: private data, or a way out",
    async (dir) => {
      const leg = legNamed(dir);
      return leg.includes("private data") || leg.includes("way out");
    },
    'write "Leg I cut: a way out" or "Leg I cut: private data" in notes/trifecta.md',
  ),
  rule(
    "Your server matches the leg you named",
    serverMatchesLeg,
    "a way out: no tool may take an address such as to. " +
      "Private data: no tool result may hold the owner's real phone or email",
  ),
];
