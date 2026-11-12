// return-errors-the-model-can-fix: five planted bad bookings. Each error must name what is wrong and how to fix it,
// because the error text is the only thing the model reads before it tries again.
import { addDays } from "../world/seed";
import { call, timesIn, withServer, type ToolResult } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";

const run = scenario(async (dir) =>
  withServer(dir, async ({ client, world }) => {
    const before = world.appointmentCount();
    const book = (args: Record<string, unknown>) => call(client, "book_appointment", { patient_id: "P-0001", vet_id: "S-05", length: 20, reason: "Booster", ...args });
    const unknownPatient = await book({ patient_id: "P-9999", start: "10:20" });
    const past = await book({ date: addDays(world.clock.date, -3), start: "10:00" });
    const clash = await book({ start: "10:40" });
    const closed = await book({ start: "18:30" });
    const badLength = await book({ start: "10:20", length: 25 });
    const planted = world.appointmentCount() - before;
    const truthReyes = world.freeSlots({ site: "millbrook", length: 20, vet_id: "S-05" }).map((s) => s.start);
    const good = await book({ start: "10:20" });
    const added = world.appointmentCount() - before;
    return { unknownPatient, past, clash, closed, badLength, planted, truthReyes, good, added, clock: world.clock };
  }));
const ok = async (dir: string) => { const r = await run(dir); return failed(r) ? undefined : r; };
const err = (r: ToolResult | undefined, ...must: (string | RegExp)[]) =>
  Boolean(r?.isError && !r.thrown && must.every((m) => (typeof m === "string" ? r.text.includes(m) : m.test(r.text))));
let lastError = "";

export default [
  rule("The server starts and answers an MCP client", async (dir) => {
    const r = await run(dir);
    lastError = failed(r) ? r.failed : "";
    return !failed(r);
  }, () => `run "bun server.ts" in the problem folder and fix the first error it prints.${lastError ? ` The checker saw: ${lastError}` : ""}`),
  rule("An unknown patient: the error names patient_id and the id that was sent", async (dir) => err((await ok(dir))?.unknownPatient, "patient_id", "P-9999"),
    "check clinic.patient(patient_id) first and say which id was not found and what an id looks like"),
  rule("A start in the past: the error says it is in the past and gives the clinic clock", async (dir) => {
    const r = await ok(dir);
    return err(r?.past, /past/i, r?.clock.date ?? "?", r?.clock.time ?? "?");
  }, "compare the start with clinic.clock() and put the clock's date and time in the error, so the model can pick a later start"),
  rule("A clash: the error names the vet and lists real free slots after \"Free slots:\"", async (dir) => {
    const r = await ok(dir);
    if (!err(r?.clash, "Reyes", "Free slots:")) return false;
    const listed = timesIn(r!.clash.text.split("Free slots:")[1] ?? "");
    return listed.length > 0 && listed.every((t) => r!.truthReyes.includes(t));
  }, "on a clash, call clinic.freeSlots({ site, date, length, vet_id }) and write the times after \"Free slots:\"; never type times in by hand"),
  rule("Outside opening times: the error gives the opening and closing times", async (dir) => err((await ok(dir))?.closed, "08:00", "18:00"),
    "read clinic.openingHours(site, date) and write both times into the error"),
  rule("A length of 25 minutes: the error names length and the values that work (10 to 60)", async (dir) => err((await ok(dir))?.badLength, "length", "10", "60"),
    "give the Zod length field a message, for example .multipleOf(10, { error: \"length must be 10 to 60 minutes, in steps of 10\" })"),
  rule("None of the five bad calls wrote to the diary, and a good booking still adds one row", async (dir) => {
    const r = await ok(dir);
    return Boolean(r && r.planted === 0 && !r.good.isError && r.added === 1);
  }, "return before clinic.createAppointment on every refusal, and keep the happy path from book-an-appointment working"),
];
