// book-an-appointment: a write tool that refuses clashes, because the PIMS itself will double-book a vet.
import { call, listTools, withServer, type ToolResult } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";

type Attempt = { result: ToolResult; added: number };

const run = scenario(async (dir) =>
  withServer(dir, async ({ client, world }) => {
    const { tools } = await listTools(client);
    const tool = tools.find((t) => t.name === "book_appointment");
    const attempt = async (args: Record<string, unknown>): Promise<Attempt> => {
      const before = world.appointmentCount();
      const result = await call(client, "book_appointment", args);
      return { result, added: world.appointmentCount() - before };
    };
    if (!tool) return { tool };
    const date = world.clock.date;
    const good = await attempt({ patient_id: "P-0001", vet_id: "S-05", start: "10:20", length: 20, reason: "Booster" });
    const row = world.rows("SELECT * FROM appointments WHERE patient_id = 'P-0001' AND vet_id = 'S-05' AND date = ? AND start = '10:20' AND status = 'booked'", date)[0];
    const freed = await attempt({ patient_id: "P-0002", vet_id: "S-05", start: "11:40", length: 20, reason: "Vaccination" });
    const sameStart = await attempt({ patient_id: "P-0003", vet_id: "S-05", start: "10:20", length: 20, reason: "Lameness" });
    const overlap = await attempt({ patient_id: "P-0003", vet_id: "S-05", start: "10:30", length: 20, reason: "Lameness" });
    const badInput = await attempt({ patient_id: "P-0003", vet_id: "S-06", start: "half ten", length: 20, reason: "Lameness" });
    return { tool, good, row, freed, sameStart, overlap, badInput };
  }));
const ok = async (dir: string) => { const r = await run(dir); return failed(r) ? undefined : r; };
let lastError = "";

export default [
  rule("The server starts and answers an MCP client", async (dir) => {
    const r = await run(dir);
    lastError = failed(r) ? r.failed : "";
    return !failed(r);
  }, () => `run "bun server.ts" in the problem folder and fix the first error it prints.${lastError ? ` The checker saw: ${lastError}` : ""}`),
  rule("tools/list has book_appointment with patient_id, vet_id, start and reason", async (dir) => {
    const props = ((await ok(dir))?.tool?.inputSchema as any)?.properties ?? {};
    return ["patient_id", "vet_id", "start", "reason"].every((k) => k in props);
  }, "register book_appointment with a Zod object that has patient_id, vet_id, start and reason (and an optional date and length)"),
  rule("Booking Biscuit with Dr Reyes at 10:20 adds exactly one matching row to the diary", async (dir) => {
    const r = await ok(dir);
    return Boolean(r?.good && !r.good.result.isError && r.good.added === 1 && r.row?.length === 20 && r.row?.reason);
  }, "call clinic.createAppointment once with patient_id, vet_id, the date, start, length and reason"),
  rule("A slot freed by a cancellation can be booked (Dr Reyes at 11:40)", async (dir) => {
    const r = await ok(dir);
    return Boolean(r?.freed && !r.freed.result.isError && r.freed.added === 1);
  }, "a cancelled appointment stays in the diary with status cancelled; only booked and arrived appointments hold a vet's time"),
  rule("Booking a time that is already taken adds no row and returns isError: true", async (dir) => {
    const r = await ok(dir);
    return Boolean(r?.sameStart && r.sameStart.added === 0 && r.sameStart.result.isError && !r.sameStart.result.thrown);
  }, "read clinic.appointments({ vet_id, date }) first and return { content: [...], isError: true } when one overlaps"),
  rule("A booking that starts in the middle of another appointment is refused too (Dr Reyes at 10:30)", async (dir) => {
    const r = await ok(dir);
    return Boolean(r?.overlap && r.overlap.added === 0 && r.overlap.result.isError);
  }, "two appointments clash when each starts before the other ends: start < otherEnd && otherStart < end, in minutes"),
  rule("Arguments that fail the schema come back as a tool error the model can read, and add no row", async (dir) => {
    const r = await ok(dir);
    return Boolean(r?.badInput && r.badInput.added === 0 && r.badInput.result.isError && !r.badInput.result.thrown && r.badInput.result.text.length > 0);
  }, "give start a Zod rule such as z.string().regex(/^\\d{2}:\\d{2}$/); the SDK then answers bad input with isError: true, not a protocol error"),
];
