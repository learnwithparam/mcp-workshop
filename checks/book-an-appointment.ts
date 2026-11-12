// book-an-appointment: a write tool that refuses clashes, because the PIMS itself will double-book
// a vet.
import { call, listTools, type Session, type ToolResult, withServer } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";
import type { World } from "./lib/world";

type Attempt = { result: ToolResult; added: number };
type InputSchema = { properties?: Record<string, unknown> };

const BOOKED_ROW = [
  "SELECT * FROM appointments WHERE patientId = 'P-0001' AND vetId = 'S-05' ",
  "AND date = ? AND start = '10:20' AND status = 'booked'",
].join("");

// Each booking the check tries, in order. Later ones run against the diary the earlier ones left.
const BOOKINGS = {
  good: { patientId: "P-0001", vetId: "S-05", start: "10:20", length: 20, reason: "Booster" },
  freed: { patientId: "P-0002", vetId: "S-05", start: "11:40", length: 20, reason: "Vaccination" },
  sameStart: { patientId: "P-0003", vetId: "S-05", start: "10:20", length: 20, reason: "Lameness" },
  overlap: { patientId: "P-0003", vetId: "S-05", start: "10:30", length: 20, reason: "Lameness" },
  badInput: {
    patientId: "P-0003",
    vetId: "S-06",
    start: "half ten",
    length: 20,
    reason: "Lameness",
  },
};

/** Books once and counts how many rows that really added to the diary. */
async function attempt(
  { client, world }: Session,
  args: Record<string, unknown>,
): Promise<Attempt> {
  const before = world.appointmentCount();
  const result = await call(client, "book_appointment", args);
  return { result, added: world.appointmentCount() - before };
}

function bookedRow(world: World) {
  return world.rows(BOOKED_ROW, world.clock.date)[0];
}

const run = scenario(async (dir) =>
  withServer(dir, async (session) => {
    const { tools } = await listTools(session.client);
    const tool = tools.find((candidate) => candidate.name === "book_appointment");
    if (!tool) return { tool };
    const good = await attempt(session, BOOKINGS.good);
    const row = bookedRow(session.world);
    const freed = await attempt(session, BOOKINGS.freed);
    const sameStart = await attempt(session, BOOKINGS.sameStart);
    const overlap = await attempt(session, BOOKINGS.overlap);
    const badInput = await attempt(session, BOOKINGS.badInput);
    return { tool, good, row, freed, sameStart, overlap, badInput };
  }),
);
const ok = async (dir: string) => {
  const outcome = await run(dir);
  return failed(outcome) ? undefined : outcome;
};
let lastError = "";
const checkerSaw = () => (lastError ? ` The checker saw: ${lastError}` : "");

export default [
  rule(
    "The server starts and answers an MCP client",
    async (dir) => {
      const outcome = await run(dir);
      lastError = failed(outcome) ? outcome.failed : "";
      return !failed(outcome);
    },
    () =>
      `run "bun server.ts" in the problem folder and fix the first error it prints.${checkerSaw()}`,
  ),
  rule(
    "tools/list has book_appointment with patientId, vetId, start and reason",
    async (dir) => {
      const schema = (await ok(dir))?.tool?.inputSchema as InputSchema | undefined;
      const properties = schema?.properties ?? {};
      return ["patientId", "vetId", "start", "reason"].every((name) => name in properties);
    },
    "register book_appointment with a Zod object that has patientId, vetId, start and reason " +
      "(and an optional date and length)",
  ),
  rule(
    "Booking Biscuit with Dr Reyes at 10:20 adds exactly one matching row to the diary",
    async (dir) => {
      const outcome = await ok(dir);
      return Boolean(
        outcome?.good &&
          !outcome.good.result.isError &&
          outcome.good.added === 1 &&
          outcome.row?.length === 20 &&
          outcome.row?.reason,
      );
    },
    "call clinic.createAppointment once with patientId, vetId, the date, start, length and reason",
  ),
  rule(
    "A slot freed by a cancellation can be booked (Dr Reyes at 11:40)",
    async (dir) => {
      const freed = (await ok(dir))?.freed;
      return Boolean(freed && !freed.result.isError && freed.added === 1);
    },
    "a cancelled appointment stays in the diary with status cancelled; " +
      "only booked and arrived appointments hold a vet's time",
  ),
  rule(
    "Booking a time that is already taken adds no row and returns isError: true",
    async (dir) => {
      const sameStart = (await ok(dir))?.sameStart;
      return Boolean(
        sameStart && sameStart.added === 0 && sameStart.result.isError && !sameStart.result.thrown,
      );
    },
    "read clinic.appointments({ vetId, date }) first " +
      "and return { content: [...], isError: true } when one overlaps",
  ),
  rule(
    "A booking that starts in the middle of another appointment is refused too (Dr Reyes at 10:30)",
    async (dir) => {
      const overlap = (await ok(dir))?.overlap;
      return Boolean(overlap && overlap.added === 0 && overlap.result.isError);
    },
    "two appointments clash when each starts before the other ends: " +
      "start < otherEnd && otherStart < end, in minutes",
  ),
  rule(
    "Arguments that fail the schema come back as a tool error the model can read, and add no row",
    async (dir) => {
      const badInput = (await ok(dir))?.badInput;
      return Boolean(
        badInput &&
          badInput.added === 0 &&
          badInput.result.isError &&
          !badInput.result.thrown &&
          badInput.result.text.length > 0,
      );
    },
    "give start a Zod rule such as z.string().regex(/^\\d{2}:\\d{2}$/); " +
      "the SDK then answers bad input with isError: true, not a protocol error",
  ),
];
