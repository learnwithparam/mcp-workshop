// The Harrow Lane practice system (PIMS). Your MCP server calls these functions; you never edit this file.
// Import it from any step folder with: import { clinic } from "#clinic";
//
// Like a real PIMS API, it does what it is told. It will happily double-book a vet, because vets squeeze in
// emergencies. Keeping the front desk's bookings clean is the job of the layer you build on top.
//
// Every call is written as one JSON line to the world log (CLINIC_LOG), so a check can see what your server did.
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CLOCK, hoursFor, SLOT_STEP, seed, clockTimeFromMinutes, minutesSinceMidnight } from "./seed";

export const WORLD_DIR = join(import.meta.dir, "data");
const dbPath = () => process.env.CLINIC_DB ?? join(WORLD_DIR, "clinic.sqlite");
const logPath = () => process.env.CLINIC_LOG ?? join(WORLD_DIR, "clinic.log");

let db: Database | undefined;
function open(): Database {
  if (db) return db;
  const p = dbPath();
  if (!existsSync(p)) seed(p);
  db = new Database(p);
  return db;
}

function log(fn: string, args: unknown, result?: unknown) {
  const p = logPath();
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(
    p,
    `${JSON.stringify({
      fn,
      args,
      rows: Array.isArray(result) ? result.length : undefined,
      pid: process.pid,
    })}\n`,
  );
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

const all = <T>(sql: string, ...p: any[]) =>
  open()
    .query(sql)
    .all(...p) as T[];
const one = <T>(sql: string, ...p: any[]) =>
  (open()
    .query(sql)
    .get(...p) as T | null) ?? undefined;

export const clinic = {
  /** The clinic clock: the date and time the world believes it is. */
  clock() {
    return { date: CLOCK.date, time: CLOCK.time };
  },

  sites(): Site[] {
    log("sites", {});
    return all<Site>("SELECT id, name FROM sites ORDER BY id");
  },

  /** Opening hours for one site on one date, or null when it is closed. */
  openingHours(site: string, date: string): { open: string; close: string } | null {
    log("openingHours", { site, date });
    const h = hoursFor(site, date);
    return h ? { open: h[0], close: h[1] } : null;
  },

  staff(filter: { site?: string; role?: string } = {}): Staff[] {
    log("staff", filter);
    return all<Staff>(
      "SELECT * FROM staff WHERE (?1 IS NULL OR site = ?1) AND (?2 IS NULL OR role = ?2) ORDER BY id",
      filter.site ?? null,
      filter.role ?? null,
    );
  },

  staffMember(id: string): Staff | undefined {
    log("staffMember", { id });
    return one<Staff>("SELECT * FROM staff WHERE id = ?", id);
  },

  /** Vets are staff who see patients: vets and the clinical director. */
  vets(site?: string): Staff[] {
    log("vets", { site });
    return all<Staff>(
      "SELECT * FROM staff WHERE role IN ('vet','director') AND (?1 IS NULL OR site = ?1) ORDER BY id",
      site ?? null,
    );
  },

  patient(id: string): Patient | undefined {
    log("patient", { id });
    return one<Patient>("SELECT * FROM patients WHERE id = ?", id);
  },

  findPatients(q: {
    name?: string;
    ownerPhone?: string;
    ownerName?: string;
  }): (Patient & { ownerName: string })[] {
    const r = all<Patient & { ownerName: string }>(
      `SELECT p.*, o.name AS ownerName FROM patients p JOIN owners o ON o.id = p.ownerId
       WHERE (?1 IS NULL OR lower(p.name) = lower(?1)) AND (?2 IS NULL OR replace(o.phone,' ','') = replace(?2,' ',''))
         AND (?3 IS NULL OR lower(o.name) LIKE '%' || lower(?3) || '%') ORDER BY p.id LIMIT 50`,
      q.name ?? null,
      q.ownerPhone ?? null,
      q.ownerName ?? null,
    );
    log("findPatients", q, r);
    return r;
  },

  owner(id: string): Owner | undefined {
    log("owner", { id });
    return one<Owner>("SELECT * FROM owners WHERE id = ?", id);
  },

  /** Every appointment that matches, in any status. Cancelled ones are still listed. */
  appointments(filter: {
    vetId?: string;
    site?: string;
    date?: string;
    patientId?: string;
  }): Appointment[] {
    const r = all<Appointment>(
      `SELECT * FROM appointments WHERE (?1 IS NULL OR vetId = ?1) AND (?2 IS NULL OR site = ?2)
       AND (?3 IS NULL OR date = ?3) AND (?4 IS NULL OR patientId = ?4) ORDER BY date, start, id`,
      filter.vetId ?? null,
      filter.site ?? null,
      filter.date ?? null,
      filter.patientId ?? null,
    );
    log("appointments", filter, r);
    return r;
  },

  appointment(id: string): Appointment | undefined {
    log("appointment", { id });
    return one<Appointment>("SELECT * FROM appointments WHERE id = ?", id);
  },

  /** Writes an appointment. It does NOT check for clashes or opening hours: the PIMS allows double-booking. */
  createAppointment(a: {
    patientId: string;
    vetId: string;
    date: string;
    start: string;
    length: number;
    reason: string;
    site?: string;
  }): Appointment {
    const vet = one<Staff>("SELECT * FROM staff WHERE id = ?", a.vetId);
    const row = open()
      .query("SELECT 'A-' || printf('%05d', COUNT(*) + 1) AS id FROM appointments")
      .get() as { id: string };
    const appt: Appointment = {
      id: row.id,
      patientId: a.patientId,
      vetId: a.vetId,
      site: a.site ?? vet?.site ?? "",
      date: a.date,
      start: a.start,
      length: a.length,
      reason: a.reason,
      status: "booked",
    };
    open().run("INSERT INTO appointments VALUES (?,?,?,?,?,?,?,?,?)", [
      appt.id,
      appt.patientId,
      appt.vetId,
      appt.site,
      appt.date,
      appt.start,
      appt.length,
      appt.reason,
      appt.status,
    ]);
    log("createAppointment", a);
    return appt;
  },

  /** Marks an appointment cancelled. The row stays in the diary with status "cancelled". */
  cancelAppointment(id: string): Appointment | undefined {
    open().run("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [id]);
    log("cancelAppointment", { id });
    return one<Appointment>("SELECT * FROM appointments WHERE id = ?", id);
  },

  /** Moves an appointment to a new vet, date or start. No clash check, like createAppointment. */
  moveAppointment(
    id: string,
    to: { vetId?: string; date?: string; start?: string },
  ): Appointment | undefined {
    const cur = one<Appointment>("SELECT * FROM appointments WHERE id = ?", id);
    if (!cur) return undefined;
    open().run("UPDATE appointments SET vetId = ?, date = ?, start = ? WHERE id = ?", [
      to.vetId ?? cur.vetId,
      to.date ?? cur.date,
      to.start ?? cur.start,
      id,
    ]);
    log("moveAppointment", { id, ...to });
    return one<Appointment>("SELECT * FROM appointments WHERE id = ?", id);
  },

  /**
   * The PIMS's own "find a slot" search: start times on a 10-minute grid where a vet at the site has no
   * booked or arrived appointment overlapping [start, start + length), inside opening hours and after the clock.
   */
  freeSlots(q: { site: string; date: string; length: number; vetId?: string }): FreeSlot[] {
    const hours = hoursFor(q.site, q.date);
    const out: FreeSlot[] = [];
    if (hours) {
      const vets = all<Staff>(
        "SELECT * FROM staff WHERE role IN ('vet','director') AND site = ? ORDER BY id",
        q.site,
      ).filter((v) => !q.vetId || v.id === q.vetId);
      const earliest =
        q.date === CLOCK.date ? minutesSinceMidnight(CLOCK.time) : q.date < CLOCK.date ? Infinity : 0;
      for (const v of vets) {
        const busy = all<Appointment>(
          "SELECT * FROM appointments WHERE vetId = ? AND date = ? AND status IN ('booked','arrived')",
          v.id,
          q.date,
        ).map((a) => [minutesSinceMidnight(a.start), minutesSinceMidnight(a.start) + a.length]);
        for (let t = minutesSinceMidnight(hours[0]); t + q.length <= minutesSinceMidnight(hours[1]); t += SLOT_STEP) {
          if (t < earliest) continue;
          if (busy.some(([s, e]) => t < e && s < t + q.length)) continue;
          out.push({
            vetId: v.id,
            vetName: v.name,
            site: q.site,
            date: q.date,
            start: clockTimeFromMinutes(t),
            length: q.length,
          });
        }
      }
    }
    log("freeSlots", q, out);
    return out;
  },

  clinicalNotes(patientId: string) {
    const r = all<{
      id: string;
      patientId: string;
      vetId: string;
      date: string;
      soap: string;
      plan: string;
    }>("SELECT * FROM clinical_notes WHERE patientId = ? ORDER BY date DESC", patientId);
    log("clinicalNotes", { patientId: patientId }, r);
    return r;
  },

  vaccinations(patientId: string) {
    const r = all<{ id: string; patientId: string; vaccine: string; given: string; due: string }>(
      "SELECT * FROM vaccinations WHERE patientId = ? ORDER BY due",
      patientId,
    );
    log("vaccinations", { patientId: patientId }, r);
    return r;
  },

  controlledDrugs(filter: { drug?: string } = {}) {
    const r = all<{
      id: string;
      date: string;
      drug: string;
      batch: string;
      patientId: string;
      vetId: string;
      amountMl: number;
      balanceMl: number;
    }>(
      "SELECT * FROM controlled_drugs WHERE (?1 IS NULL OR drug = ?1) ORDER BY id",
      filter.drug ?? null,
    );
    log("controlledDrugs", filter, r);
    return r;
  },
};

export { CLOCK };
