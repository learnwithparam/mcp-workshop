// return-errors-the-model-can-fix: five planted bad bookings. Each error must name what is wrong
// and how to fix it, because the error text is the only thing the model reads before it tries
// again.
import { addDays } from "../world/seed";
import { call, type ToolResult, timesIn, withServer } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";

const run = scenario(async (dir) =>
  withServer(dir, async ({ client, world }) => {
    const before = world.appointmentCount();
    const book = (args: Record<string, unknown>) =>
      call(client, "book_appointment", {
        patientId: "P-0001",
        vetId: "S-05",
        length: 20,
        reason: "Booster",
        ...args,
      });
    const unknownPatient = await book({ patientId: "P-9999", start: "10:20" });
    const past = await book({ date: addDays(world.clock.date, -3), start: "10:00" });
    const clash = await book({ start: "10:40" });
    const closed = await book({ start: "18:30" });
    const badLength = await book({ start: "10:20", length: 25 });
    const planted = world.appointmentCount() - before;
    const reyesSlots = world.freeSlots({ site: "millbrook", length: 20, vetId: "S-05" });
    const truthReyes = reyesSlots.map((slot) => slot.start);
    const good = await book({ start: "10:20" });
    const added = world.appointmentCount() - before;
    return {
      unknownPatient,
      past,
      clash,
      closed,
      badLength,
      planted,
      truthReyes,
      good,
      added,
      clock: world.clock,
    };
  }),
);
const ok = async (dir: string) => {
  const outcome = await run(dir);
  return failed(outcome) ? undefined : outcome;
};

const mentions = (text: string, wanted: string | RegExp) =>
  typeof wanted === "string" ? text.includes(wanted) : wanted.test(text);

/** True when the result is a tool error (not a crash) whose text has every wanted piece. */
const isErrorSaying = (result: ToolResult | undefined, ...wanted: (string | RegExp)[]) =>
  Boolean(
    result?.isError && !result.thrown && wanted.every((piece) => mentions(result.text, piece)),
  );
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
    "An unknown patient: the error names patientId and the id that was sent",
    async (dir) => isErrorSaying((await ok(dir))?.unknownPatient, "patientId", "P-9999"),
    "check clinic.patient(patientId) first " +
      "and say which id was not found and what an id looks like",
  ),
  rule(
    "A start in the past: the error says it is in the past and gives the clinic clock",
    async (dir) => {
      const outcome = await ok(dir);
      const clockDate = outcome?.clock.date ?? "?";
      const clockTime = outcome?.clock.time ?? "?";
      return isErrorSaying(outcome?.past, /past/i, clockDate, clockTime);
    },
    "compare the start with clinic.clock() and put the clock's date and time in the error, " +
      "so the model can pick a later start",
  ),
  rule(
    'A clash: the error names the vet and lists real free slots after "Free slots:"',
    async (dir) => {
      const outcome = await ok(dir);
      if (!isErrorSaying(outcome?.clash, "Reyes", "Free slots:")) return false;
      const listed = timesIn(outcome?.clash.text.split("Free slots:")[1] ?? "");
      return listed.length > 0 && listed.every((time) => outcome?.truthReyes.includes(time));
    },
    "on a clash, call clinic.freeSlots({ site, date, length, vetId }) " +
      'and write the times after "Free slots:"; never type times in by hand',
  ),
  rule(
    "Outside opening times: the error gives the opening and closing times",
    async (dir) => isErrorSaying((await ok(dir))?.closed, "08:00", "18:00"),
    "read clinic.openingHours(site, date) and write both times into the error",
  ),
  rule(
    "A length of 25 minutes: the error names length and the values that work (10 to 60)",
    async (dir) => isErrorSaying((await ok(dir))?.badLength, "length", "10", "60"),
    "give the Zod length field a message, for example " +
      '.multipleOf(10, { error: "length must be 10 to 60 minutes, in steps of 10" })',
  ),
  rule(
    "None of the five bad calls wrote to the diary, and a good booking still adds one row",
    async (dir) => {
      const outcome = await ok(dir);
      return Boolean(
        outcome && outcome.planted === 0 && !outcome.good.isError && outcome.added === 1,
      );
    },
    "return before clinic.createAppointment on every refusal, " +
      "and keep the happy path from book-an-appointment working",
  ),
];
