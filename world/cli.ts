// bun run world          describe the clinic in plain sentences
// bun run world reset    rebuild the practice system from the seed (undoes every booking you made)
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { WORLD_DIR, clinic } from "./clinic";
import { MILLBROOK_GAPS, seed } from "./seed";

const db = process.env.CLINIC_DB ?? join(WORLD_DIR, "clinic.sqlite");
if (process.argv[2] === "reset") {
  seed(db);
  const log = process.env.CLINIC_LOG ?? join(WORLD_DIR, "clinic.log");
  if (existsSync(log)) rmSync(log);
  console.log("The practice system is back to its starting state.");
}
const { Database } = await import("bun:sqlite");
clinic.sites(); // creates the database on first run
const raw = new Database(db, { readonly: true });
const count = (t: string) => (raw.query(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
const { date, time } = clinic.clock();
const mb = clinic.appointments({ site: "millbrook", date }).filter((a) => a.status !== "cancelled").length;
const free = clinic.freeSlots({ site: "millbrook", date, length: 20 }).length;
console.log(`Harrow Lane Veterinary: ${count("sites")} sites, ${count("staff")} staff, ${count("owners")} owners, ${count("patients")} patients.`);
console.log(`The diary holds ${count("appointments")} appointments, ${count("clinical_notes")} clinical notes, ${count("vaccinations")} vaccinations and ${count("controlled_drugs")} controlled-drug entries.`);
console.log(`Clinic clock: ${date} ${time}. Millbrook has ${mb} appointments booked on the clock's date and ${free} free 20-minute slots.`);
console.log(`Biscuit (P-0001, Labrador, Millbrook) has a booster due. Dr Sam Reyes is S-05, Dr Hannah Cole is S-06.`);
if (process.argv[2] !== "reset" && free !== Object.values(MILLBROOK_GAPS).flat().length) console.log("The diary has changed since the seed. Run: bun run world reset");
