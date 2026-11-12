// The world a check runs against: a fresh copy of the seeded practice system and an empty log, per
// run. Checks read the diary and the log to see what really changed. They never read the model's reply.
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLOCK,
  clockTimeFromMinutes,
  hoursFor,
  minutesSinceMidnight,
  SLOT_STEP,
  seed,
} from "../../world/seed";

/** One line of the world log: a PIMS function the server called, and what it passed. */
export type LoggedCall = { fn: string; args: Record<string, unknown>; rows?: number; pid: number };

type TrueFreeSlot = { vetId: string; start: string };
type SlotSearch = { site: string; date?: string; length: number; vetId?: string };

let template: string | undefined;

// Seeding takes a moment, so it happens once per process. Each world then copies the file.
function seededTemplate(): string {
  if (template && existsSync(template)) return template;
  template = join(mkdtempSync(join(tmpdir(), "harrow-seed-")), "clinic.seed.sqlite");
  seed(template);
  return template;
}

function readRows<Row>(databasePath: string, sql: string, params: SQLQueryBindings[]): Row[] {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.query(sql).all(...params) as Row[];
  } finally {
    database.close();
  }
}

function writeRows(databasePath: string, sql: string, params: SQLQueryBindings[]) {
  const database = new Database(databasePath);
  try {
    database.run(sql, params);
  } finally {
    database.close();
  }
}

function loggedCalls(logPath: string): LoggedCall[] {
  if (!existsSync(logPath)) return [];
  const lines = readFileSync(logPath, "utf8").trim().split("\n");
  const records = lines.filter(Boolean);
  return records.map((line) => JSON.parse(line) as LoggedCall);
}

/** Busy periods for one vet on one date, as [start, end) in minutes. */
function busyPeriods(databasePath: string, vetId: string, date: string): [number, number][] {
  const busy = readRows<{ start: string; length: number }>(
    databasePath,
    "SELECT start, length FROM appointments " +
      "WHERE vetId = ? AND date = ? AND status IN ('booked','arrived')",
    [vetId, date],
  );
  return busy.map((appointment) => {
    const start = minutesSinceMidnight(appointment.start);
    return [start, start + appointment.length];
  });
}

/** The true free slots, computed here from the diary rows, independent of the PIMS code. */
function trueFreeSlots(databasePath: string, search: SlotSearch): TrueFreeSlot[] {
  const date = search.date ?? CLOCK.date;
  const hours = hoursFor(search.site, date);
  if (!hours) return [];
  const vetsAtSite = readRows<{ id: string }>(
    databasePath,
    "SELECT id FROM staff WHERE role IN ('vet','director') AND site = ? ORDER BY id",
    [search.site],
  );
  const vets = vetsAtSite.filter((vet) => !search.vetId || vet.id === search.vetId);
  const opening = minutesSinceMidnight(hours[0]);
  const closing = minutesSinceMidnight(hours[1]);
  let earliest = 0;
  if (date === CLOCK.date) earliest = minutesSinceMidnight(CLOCK.time);
  const slots: TrueFreeSlot[] = [];
  for (const vet of vets) {
    const busy = busyPeriods(databasePath, vet.id, date);
    for (let start = opening; start + search.length <= closing; start += SLOT_STEP) {
      const end = start + search.length;
      const overlapsBusy = busy.some(([busyStart, busyEnd]) => start < busyEnd && busyStart < end);
      if (start >= earliest && !overlapsBusy) {
        slots.push({ vetId: vet.id, start: clockTimeFromMinutes(start) });
      }
    }
  }
  return slots;
}

export type World = ReturnType<typeof freshWorld>;

export function freshWorld() {
  const dir = mkdtempSync(join(tmpdir(), "harrow-world-"));
  const db = join(dir, "clinic.sqlite");
  const log = join(dir, "clinic.log");
  copyFileSync(seededTemplate(), db);
  return {
    dir,
    db,
    log,
    // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
    env: { CLINIC_DB: db, CLINIC_LOG: log },
    clock: CLOCK,
    /** Run one read-only query on the world's diary. */
    rows<Row = Record<string, unknown>>(sql: string, ...params: SQLQueryBindings[]): Row[] {
      return readRows<Row>(db, sql, params);
    },
    /** Write to the world's diary directly, as another member of staff would through the PIMS screen. */
    exec(sql: string, ...params: SQLQueryBindings[]) {
      writeRows(db, sql, params);
    },
    /** Every PIMS call the server made, in order. */
    calls(): LoggedCall[] {
      return loggedCalls(log);
    },
    appointmentCount(): number {
      return readRows<{ n: number }>(db, "SELECT COUNT(*) AS n FROM appointments", [])[0].n;
    },
    /** The true free slots, computed here from the diary rows, independent of the PIMS code. */
    freeSlots(search: SlotSearch): TrueFreeSlot[] {
      return trueFreeSlots(db, search);
    },
  };
}
