// The Harrow Lane practice system (PIMS). Your MCP server calls these functions.
// You never edit this file. Import it from any step folder with:
//   import { clinic } from "#clinic";
//
// Like a real PIMS API, it does what it is told. It will happily double-book a vet, because vets
// squeeze in emergencies. Keeping the front desk's bookings clean is the job of the layer you build
// on top.
//
// Every call is written as one JSON line to the world log (CLINIC_LOG), so a check can see what your
// server did.
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CLOCK,
  clockTimeFromMinutes,
  hoursFor,
  minutesSinceMidnight,
  SLOT_STEP,
  seed,
} from "./seed";

export const WORLD_DIR = join(import.meta.dir, "data");

// The paths are read on every call, so a check can point a fresh world at its own files.
const databasePath = () => process.env.CLINIC_DB ?? join(WORLD_DIR, "clinic.sqlite");
const logPath = () => process.env.CLINIC_LOG ?? join(WORLD_DIR, "clinic.log");

let openDatabase: Database | undefined;

/** The clinic database, opened once. It is built from the seed the first time it is needed. */
function database(): Database {
  if (openDatabase) return openDatabase;
  const path = databasePath();
  if (!existsSync(path)) seed(path);
  openDatabase = new Database(path);
  return openDatabase;
}

/** Writes one line to the world log: which function ran, with what, and how many rows came back. */
function log(functionName: string, args: unknown, result?: unknown) {
  const path = logPath();
  mkdirSync(dirname(path), { recursive: true });
  const record = {
    fn: functionName,
    args,
    rows: Array.isArray(result) ? result.length : undefined,
    pid: process.pid,
  };
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}

export type Site = { id: string; name: string };
export type Staff = {
  id: string;
  name: string;
  role: "receptionist" | "nurse" | "vet" | "director";
  site: string;
};
export type Owner = {
  id: string;
  name: string;
  phone: string;
  email: string;
  reminderConsent: number;
};
export type Patient = {
  id: string;
  ownerId: string;
  name: string;
  species: string;
  breed: string;
  born: string;
  homeSite: string;
  alerts: string;
  weights: string;
};
export type Appointment = {
  id: string;
  patientId: string;
  vetId: string;
  site: string;
  date: string;
  start: string;
  length: number;
  reason: string;
  status: "booked" | "arrived" | "no-show" | "cancelled";
};
export type FreeSlot = {
  vetId: string;
  vetName: string;
  site: string;
  date: string;
  start: string;
  length: number;
};
export type ClinicalNote = {
  id: string;
  patientId: string;
  vetId: string;
  date: string;
  soap: string;
  plan: string;
};
export type Vaccination = {
  id: string;
  patientId: string;
  vaccine: string;
  given: string;
  due: string;
};
export type ControlledDrugEntry = {
  id: string;
  date: string;
  drug: string;
  batch: string;
  patientId: string;
  vetId: string;
  amountMl: number;
  balanceMl: number;
};

/** Every row the query finds. */
function allRows<Row>(sql: string, ...parameters: SQLQueryBindings[]): Row[] {
  const query = database().query(sql);
  return query.all(...parameters) as Row[];
}

/** The first row the query finds, or undefined when there is none. */
function firstRow<Row>(sql: string, ...parameters: SQLQueryBindings[]): Row | undefined {
  const query = database().query(sql);
  const row = query.get(...parameters) as Row | null;
  return row ?? undefined;
}

// In these queries "?1 IS NULL OR ..." means: when that filter is not given, do not filter on it.

const STAFF_BY_SITE_AND_ROLE =
  "SELECT * FROM staff WHERE (?1 IS NULL OR site = ?1) AND (?2 IS NULL OR role = ?2) ORDER BY id";

const VETS_BY_SITE =
  "SELECT * FROM staff WHERE role IN ('vet','director') AND (?1 IS NULL OR site = ?1) ORDER BY id";

const FIND_PATIENTS = [
  "SELECT p.*, o.name AS ownerName FROM patients p JOIN owners o ON o.id = p.ownerId",
  "WHERE (?1 IS NULL OR lower(p.name) = lower(?1))",
  "AND (?2 IS NULL OR replace(o.phone,' ','') = replace(?2,' ',''))",
  "AND (?3 IS NULL OR lower(o.name) LIKE '%' || lower(?3) || '%')",
  "ORDER BY p.id LIMIT 50",
].join(" ");

const FIND_APPOINTMENTS = [
  "SELECT * FROM appointments",
  "WHERE (?1 IS NULL OR vetId = ?1) AND (?2 IS NULL OR site = ?2)",
  "AND (?3 IS NULL OR date = ?3) AND (?4 IS NULL OR patientId = ?4)",
  "ORDER BY date, start, id",
].join(" ");

const BUSY_APPOINTMENTS =
  "SELECT * FROM appointments WHERE vetId = ? AND date = ? AND status IN ('booked','arrived')";

const CONTROLLED_DRUGS = "SELECT * FROM controlled_drugs WHERE (?1 IS NULL OR drug = ?1) ORDER BY id";

const appointmentById = (id: string) =>
  firstRow<Appointment>("SELECT * FROM appointments WHERE id = ?", id);

/** The next free appointment id, such as "A-01962". */
function nextAppointmentId(): string {
  const row = firstRow<{ id: string }>(
    "SELECT 'A-' || printf('%05d', COUNT(*) + 1) AS id FROM appointments",
  );
  return row?.id ?? "";
}

/** The earliest start minute that can still be offered on `date`: no slots in the past. */
function earliestStartOn(date: string): number {
  if (date === CLOCK.date) return minutesSinceMidnight(CLOCK.time);
  if (date < CLOCK.date) return Number.POSITIVE_INFINITY;
  return 0;
}

/** Busy periods for one vet on one date, as [start, end) in minutes. Cancelled ones do not count. */
function busyPeriods(vetId: string, date: string): [number, number][] {
  const busy = allRows<Appointment>(BUSY_APPOINTMENTS, vetId, date);
  return busy.map((appointment) => {
    const start = minutesSinceMidnight(appointment.start);
    return [start, start + appointment.length];
  });
}

type SlotSearch = { site: string; date: string; length: number; vetId?: string };

/** Every free start time for one vet, on the SLOT_STEP grid, inside the opening hours. */
function freeSlotsForVet(vet: Staff, search: SlotSearch, hours: [string, string]): FreeSlot[] {
  const busy = busyPeriods(vet.id, search.date);
  const earliest = earliestStartOn(search.date);
  const opening = minutesSinceMidnight(hours[0]);
  const closing = minutesSinceMidnight(hours[1]);
  const slots: FreeSlot[] = [];
  for (let start = opening; start + search.length <= closing; start += SLOT_STEP) {
    const end = start + search.length;
    const overlapsBusy = busy.some(([busyStart, busyEnd]) => start < busyEnd && busyStart < end);
    if (start >= earliest && !overlapsBusy) {
      slots.push({
        vetId: vet.id,
        vetName: vet.name,
        site: search.site,
        date: search.date,
        start: clockTimeFromMinutes(start),
        length: search.length,
      });
    }
  }
  return slots;
}

export const clinic = {
  /** The clinic clock: the date and time the world believes it is. */
  clock() {
    return { date: CLOCK.date, time: CLOCK.time };
  },

  sites(): Site[] {
    log("sites", {});
    return allRows<Site>("SELECT id, name FROM sites ORDER BY id");
  },

  /** Opening hours for one site on one date, or null when it is closed. */
  openingHours(site: string, date: string): { open: string; close: string } | null {
    log("openingHours", { site, date });
    const hours = hoursFor(site, date);
    if (!hours) return null;
    return { open: hours[0], close: hours[1] };
  },

  staff(filter: { site?: string; role?: string } = {}): Staff[] {
    log("staff", filter);
    return allRows<Staff>(STAFF_BY_SITE_AND_ROLE, filter.site ?? null, filter.role ?? null);
  },

  staffMember(id: string): Staff | undefined {
    log("staffMember", { id });
    return firstRow<Staff>("SELECT * FROM staff WHERE id = ?", id);
  },

  /** Vets are staff who see patients: vets and the clinical director. */
  vets(site?: string): Staff[] {
    log("vets", { site });
    return allRows<Staff>(VETS_BY_SITE, site ?? null);
  },

  patient(id: string): Patient | undefined {
    log("patient", { id });
    return firstRow<Patient>("SELECT * FROM patients WHERE id = ?", id);
  },

  /** Patients by exact pet name, owner phone (spaces ignored), or part of the owner's name. */
  findPatients(search: {
    name?: string;
    ownerPhone?: string;
    ownerName?: string;
  }): (Patient & { ownerName: string })[] {
    const patients = allRows<Patient & { ownerName: string }>(
      FIND_PATIENTS,
      search.name ?? null,
      search.ownerPhone ?? null,
      search.ownerName ?? null,
    );
    log("findPatients", search, patients);
    return patients;
  },

  owner(id: string): Owner | undefined {
    log("owner", { id });
    return firstRow<Owner>("SELECT * FROM owners WHERE id = ?", id);
  },

  /** Every appointment that matches, in any status. Cancelled ones are still listed. */
  appointments(filter: {
    vetId?: string;
    site?: string;
    date?: string;
    patientId?: string;
  }): Appointment[] {
    const appointments = allRows<Appointment>(
      FIND_APPOINTMENTS,
      filter.vetId ?? null,
      filter.site ?? null,
      filter.date ?? null,
      filter.patientId ?? null,
    );
    log("appointments", filter, appointments);
    return appointments;
  },

  appointment(id: string): Appointment | undefined {
    log("appointment", { id });
    return appointmentById(id);
  },

  /**
   * Writes an appointment. It does NOT check for clashes or opening hours: the PIMS allows
   * double-booking. Without a site, the appointment goes to the vet's own site.
   */
  createAppointment(booking: {
    patientId: string;
    vetId: string;
    date: string;
    start: string;
    length: number;
    reason: string;
    site?: string;
  }): Appointment {
    const vet = firstRow<Staff>("SELECT * FROM staff WHERE id = ?", booking.vetId);
    const appointment: Appointment = {
      id: nextAppointmentId(),
      patientId: booking.patientId,
      vetId: booking.vetId,
      site: booking.site ?? vet?.site ?? "",
      date: booking.date,
      start: booking.start,
      length: booking.length,
      reason: booking.reason,
      status: "booked",
    };
    database().run("INSERT INTO appointments VALUES (?,?,?,?,?,?,?,?,?)", [
      appointment.id,
      appointment.patientId,
      appointment.vetId,
      appointment.site,
      appointment.date,
      appointment.start,
      appointment.length,
      appointment.reason,
      appointment.status,
    ]);
    log("createAppointment", booking);
    return appointment;
  },

  /** Marks an appointment cancelled. The row stays in the diary with status "cancelled". */
  cancelAppointment(id: string): Appointment | undefined {
    database().run("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [id]);
    log("cancelAppointment", { id });
    return appointmentById(id);
  },

  /** Moves an appointment to a new vet, date or start. No clash check, like createAppointment. */
  moveAppointment(
    id: string,
    changes: { vetId?: string; date?: string; start?: string },
  ): Appointment | undefined {
    const current = appointmentById(id);
    if (!current) return undefined;
    database().run("UPDATE appointments SET vetId = ?, date = ?, start = ? WHERE id = ?", [
      changes.vetId ?? current.vetId,
      changes.date ?? current.date,
      changes.start ?? current.start,
      id,
    ]);
    log("moveAppointment", { id, ...changes });
    return appointmentById(id);
  },

  /**
   * The PIMS's own "find a slot" search. It lists start times on a 10-minute grid where a vet at
   * the site has no booked or arrived appointment overlapping [start, start + length). Every slot
   * is inside opening hours and after the clinic clock.
   */
  freeSlots(search: SlotSearch): FreeSlot[] {
    const hours = hoursFor(search.site, search.date);
    let slots: FreeSlot[] = [];
    if (hours) {
      const vetsAtSite = allRows<Staff>(
        "SELECT * FROM staff WHERE role IN ('vet','director') AND site = ? ORDER BY id",
        search.site,
      );
      const vets = vetsAtSite.filter((vet) => !search.vetId || vet.id === search.vetId);
      slots = vets.flatMap((vet) => freeSlotsForVet(vet, search, hours));
    }
    log("freeSlots", search, slots);
    return slots;
  },

  /** A patient's clinical notes, newest first. */
  clinicalNotes(patientId: string): ClinicalNote[] {
    const notes = allRows<ClinicalNote>(
      "SELECT * FROM clinical_notes WHERE patientId = ? ORDER BY date DESC",
      patientId,
    );
    log("clinicalNotes", { patientId }, notes);
    return notes;
  },

  /** A patient's vaccinations, the one due soonest first. */
  vaccinations(patientId: string): Vaccination[] {
    const vaccinations = allRows<Vaccination>(
      "SELECT * FROM vaccinations WHERE patientId = ? ORDER BY due",
      patientId,
    );
    log("vaccinations", { patientId }, vaccinations);
    return vaccinations;
  },

  /** The controlled drugs register, for every drug or for one. */
  controlledDrugs(filter: { drug?: string } = {}): ControlledDrugEntry[] {
    const entries = allRows<ControlledDrugEntry>(CONTROLLED_DRUGS, filter.drug ?? null);
    log("controlledDrugs", filter, entries);
    return entries;
  },
};

export { CLOCK };
