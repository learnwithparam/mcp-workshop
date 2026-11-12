// bun run world          describe the clinic in plain sentences
// bun run world reset    rebuild the practice system from the seed (undoes every booking you made)
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { clinic, WORLD_DIR } from "./clinic";
import { MILLBROOK_GAPS, seed } from "./seed";

const databasePath = process.env.CLINIC_DB ?? join(WORLD_DIR, "clinic.sqlite");
const resetting = process.argv[2] === "reset";

if (resetting) {
  seed(databasePath);
  const logPath = process.env.CLINIC_LOG ?? join(WORLD_DIR, "clinic.log");
  if (existsSync(logPath)) rmSync(logPath);
  console.log("The practice system is back to its starting state.");
}

const { Database } = await import("bun:sqlite");
// The first call to the clinic creates the database when it does not exist yet.
clinic.sites();
const readOnlyDatabase = new Database(databasePath, { readonly: true });

function rowCount(table: string): number {
  const query = readOnlyDatabase.query(`SELECT COUNT(*) AS n FROM ${table}`);
  const row = query.get() as { n: number };
  return row.n;
}

const { date, time } = clinic.clock();
const millbrookAppointments = clinic.appointments({ site: "millbrook", date });
const millbrookBooked = millbrookAppointments.filter(
  (appointment) => appointment.status !== "cancelled",
).length;
const freeSlotCount = clinic.freeSlots({ site: "millbrook", date, length: 20 }).length;

console.log(
  `Harrow Lane Veterinary: ${rowCount("sites")} sites, ${rowCount("staff")} staff, ` +
    `${rowCount("owners")} owners, ${rowCount("patients")} patients.`,
);
console.log(
  `The diary holds ${rowCount("appointments")} appointments, ` +
    `${rowCount("clinical_notes")} clinical notes, ${rowCount("vaccinations")} vaccinations ` +
    `and ${rowCount("controlled_drugs")} controlled-drug entries.`,
);
console.log(
  `Clinic clock: ${date} ${time}. Millbrook has ${millbrookBooked} appointments booked ` +
    `on the clock's date and ${freeSlotCount} free 20-minute slots.`,
);
console.log(
  "Biscuit (P-0001, Labrador, Millbrook) has a booster due. " +
    "Dr Sam Reyes is S-05, Dr Hannah Cole is S-06.",
);

// A fresh seed has exactly the planted Millbrook gaps free. Any other count means someone booked.
const plantedGapCount = Object.values(MILLBROOK_GAPS).flat().length;
if (!resetting && freeSlotCount !== plantedGapCount) {
  console.log("The diary has changed since the seed. Run: bun run world reset");
}
