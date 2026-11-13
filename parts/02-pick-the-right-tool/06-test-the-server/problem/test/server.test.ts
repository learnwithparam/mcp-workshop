// Tests for your Harrow Lane server. They run it inside this process: no socket, no model, no key.
// Run them with: bun test parts/02-pick-the-right-tool/06-test-the-server/problem/test
import { beforeAll, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../server";

// Use a scratch copy of the diary, so the tests never change your own. The clinic builds it from
// the seed the first time a test reads it. A check may set its own diary first.
process.env.CLINIC_DB ??= join(tmpdir(), `harrow-test-${process.pid}.sqlite`);
process.env.CLINIC_LOG ??= join(tmpdir(), `harrow-test-${process.pid}.log`);

const client = new Client({ name: "server-test", version: "1.0.0" });

beforeAll(async () => {
  // Two ends of one pipe: the server listens on one end, the client talks on the other.
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  await client.connect(clientSide);
});

type Slot = { vetId: string; start: string };

async function callTool(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const blocks = result.content as { type: string; text?: string }[];
  const text = blocks.map((block) => block.text ?? "").join("\n");
  return { isError: Boolean(result.isError), text, structured: result.structuredContent };
}

// Eastgate has many free times on this date, so every test can find one.
const QUIET_DATE = "2026-11-17";

// The first free slot Dr Rhys Evans (S-09) has on the quiet date. Asking the server, not
// guessing a time, keeps each test true on any diary.
async function freeSlotForDrEvans(): Promise<Slot> {
  const search = { site: "eastgate", date: QUIET_DATE, detail: "full" };
  const result = await callTool("find_free_slots", search);
  const { slots } = result.structured as { slots: Slot[] };
  const evansSlots = slots.filter((slot) => slot.vetId === "S-09");
  return evansSlots[0];
}

test("find_patient finds Biscuit by name", async () => {
  const result = await callTool("find_patient", { name: "Biscuit" });
  expect(result.isError).toBe(false);
  expect(result.text).toContain("P-0001");
});

test("find_free_slots lists a free slot for Dr Evans", async () => {
  const slot = await freeSlotForDrEvans();
  expect(slot.start).toMatch(/^\d{2}:\d{2}$/);
});

// TODO: add the tests that would catch a broken server. Each one must fail if its rule breaks:
//   - booking a free slot works (use freeSlotForDrEvans for a time that is free on any diary)
//   - booking the same time twice is refused, with a tool error
//   - booking a patient id that does not exist is refused, with a tool error
