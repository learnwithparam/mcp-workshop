// The world and the finished server behave the way the course text says they do.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { freshWorld } from "../checks/lib/world";

const world = freshWorld();
process.env.CLINIC_DB = world.db;
process.env.CLINIC_LOG = world.log;
const { connectFinished } = await import("../world/connect");
const { mintToken } = await import("../world/auth");

test("the seed plants six free 20-minute slots at Millbrook, three per vet", () => {
  const slots = world.freeSlots({ site: "millbrook", length: 20 });
  expect(slots.map((s) => s.start).sort()).toEqual(["09:00", "10:20", "11:40", "14:40", "15:00", "16:20"]);
  expect(slots.filter((s) => s.vet_id === "S-05").map((s) => s.start)).toEqual(["10:20", "11:40", "15:00"]);
});

test("Biscuit and Pepper are unique, and the counts match the README", () => {
  expect(world.rows("SELECT id FROM patients WHERE name = 'Biscuit'")).toEqual([{ id: "P-0001" }]);
  expect(world.rows("SELECT id FROM patients WHERE name = 'Pepper'")).toEqual([{ id: "P-0042" }]);
  expect(world.rows("SELECT COUNT(*) AS n FROM patients")[0].n).toBe(600);
  expect(world.rows("SELECT COUNT(*) AS n FROM staff")[0].n).toBe(12);
});

test("Ola sees no notes tool; Dr Reyes reads Millbrook notes only; Joon reads the drugs log", async () => {
  const names = async (as: string) => { const c = await connectFinished({ as }); try { return (await c.client.listTools()).tools.map((t) => t.name); } finally { await c.close(); } };
  expect(await names("ola")).not.toContain("read_notes");
  expect(await names("sam")).toContain("read_notes");
  expect(await names("sam")).not.toContain("controlled_drugs_log");
  expect(await names("joon")).toContain("controlled_drugs_log");
  const sam = await connectFinished({ as: "sam" });
  const other = world.rows("SELECT id FROM patients WHERE home_site = 'eastgate' LIMIT 1")[0].id;
  const r = await sam.client.callTool({ name: "read_notes", arguments: { patient_id: other } });
  await sam.close();
  expect(r.isError).toBe(true);
});

test("a token minted for another server is refused", async () => {
  const token = await mintToken({ staff_id: "S-08", role: "receptionist", site: "millbrook", audience: "https://lab-results.harrowlane.test/mcp" });
  await expect(connectFinished({ token })).rejects.toThrow();
});

test("the finished server refuses a clash and lists real free slots", async () => {
  const c = await connectFinished({ as: "ola" });
  const r = await c.client.callTool({ name: "book_appointment", arguments: { patient_id: "P-0001", vet_id: "S-05", start: "10:40", reason: "Booster" } });
  await c.close();
  expect(r.isError).toBe(true);
  expect((r.content as any)[0].text).toContain("Free slots: 10:20, 11:40, 15:00");
});

test("cancel waits for a yes", async () => {
  const id = world.rows("SELECT id FROM appointments WHERE vet_id = 'S-05' AND date = ? AND status = 'booked' LIMIT 1", world.clock.date)[0].id;
  const no = await connectFinished({ as: "ola", confirm: "no" });
  await no.client.callTool({ name: "cancel_appointment", arguments: { appointment_id: id } });
  await no.close();
  expect(world.rows("SELECT status FROM appointments WHERE id = ?", id)[0].status).toBe("booked");
  const yes = await connectFinished({ as: "ola", confirm: "yes" });
  await yes.client.callTool({ name: "cancel_appointment", arguments: { appointment_id: id } });
  await yes.close();
  expect(world.rows("SELECT status FROM appointments WHERE id = ?", id)[0].status).toBe("cancelled");
});
