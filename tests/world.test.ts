// The world and the finished server behave the way the course text says they do.
import { expect, test } from "bun:test";
import { freshWorld } from "../checks/lib/world";

const world = freshWorld();
process.env.CLINIC_DB = world.db;
process.env.CLINIC_LOG = world.log;
const { connectFinished } = await import("../world/connect");
const { mintToken } = await import("../world/auth");

test("the seed plants six free 20-minute slots at Millbrook, three per vet", () => {
  const slots = world.freeSlots({ site: "millbrook", length: 20 });
  const starts = slots.map((slot) => slot.start);
  expect(starts.sort()).toEqual(["09:00", "10:20", "11:40", "14:40", "15:00", "16:20"]);
  const reyesSlots = slots.filter((slot) => slot.vetId === "S-05");
  expect(reyesSlots.map((slot) => slot.start)).toEqual(["10:20", "11:40", "15:00"]);
});

test("Biscuit and Pepper are unique, and the counts match the README", () => {
  expect(world.rows("SELECT id FROM patients WHERE name = 'Biscuit'")).toEqual([{ id: "P-0001" }]);
  expect(world.rows("SELECT id FROM patients WHERE name = 'Pepper'")).toEqual([{ id: "P-0042" }]);
  expect(world.rows("SELECT COUNT(*) AS n FROM patients")[0].n).toBe(600);
  expect(world.rows("SELECT COUNT(*) AS n FROM staff")[0].n).toBe(12);
});

async function toolNamesFor(person: string): Promise<string[]> {
  const connection = await connectFinished({ as: person });
  try {
    const { tools } = await connection.client.listTools();
    return tools.map((tool) => tool.name);
  } finally {
    await connection.close();
  }
}

const rolesTestName =
  "Ola sees no notes tool; Dr Reyes reads Millbrook notes only; Joon reads the drugs log";

test(rolesTestName, async () => {
  expect(await toolNamesFor("ola")).not.toContain("read_notes");
  expect(await toolNamesFor("sam")).toContain("read_notes");
  expect(await toolNamesFor("sam")).not.toContain("controlled_drugs_log");
  expect(await toolNamesFor("joon")).toContain("controlled_drugs_log");
  const sam = await connectFinished({ as: "sam" });
  const eastgatePatients = world.rows<{ id: string }>(
    "SELECT id FROM patients WHERE homeSite = 'eastgate' LIMIT 1",
  );
  const otherSitePatient = eastgatePatients[0].id;
  const result = await sam.client.callTool({
    name: "read_notes",
    arguments: { patientId: otherSitePatient },
  });
  await sam.close();
  expect(result.isError).toBe(true);
});

test("a token minted for another server is refused", async () => {
  const token = await mintToken({
    staffId: "S-08",
    role: "receptionist",
    site: "millbrook",
    audience: "https://lab-results.harrowlane.test/mcp",
  });
  await expect(connectFinished({ token })).rejects.toThrow();
});

test("the finished server refuses a clash and lists real free slots", async () => {
  const ola = await connectFinished({ as: "ola" });
  const result = await ola.client.callTool({
    name: "book_appointment",
    arguments: { patientId: "P-0001", vetId: "S-05", start: "10:40", reason: "Booster" },
  });
  await ola.close();
  expect(result.isError).toBe(true);
  const content = result.content as { text: string }[];
  expect(content[0].text).toContain("Free slots: 10:20, 11:40, 15:00");
});

test("cancel waits for a yes", async () => {
  const id = world.rows<{ id: string }>(
    "SELECT id FROM appointments WHERE vetId = 'S-05' AND date = ? AND status = 'booked' LIMIT 1",
    world.clock.date,
  )[0].id;
  const saysNo = await connectFinished({ as: "ola", confirm: "no" });
  await saysNo.client.callTool({ name: "cancel_appointment", arguments: { appointmentId: id } });
  await saysNo.close();
  expect(world.rows("SELECT status FROM appointments WHERE id = ?", id)[0].status).toBe("booked");
  const saysYes = await connectFinished({ as: "ola", confirm: "yes" });
  await saysYes.client.callTool({ name: "cancel_appointment", arguments: { appointmentId: id } });
  await saysYes.close();
  expect(world.rows("SELECT status FROM appointments WHERE id = ?", id)[0].status).toBe(
    "cancelled",
  );
});
