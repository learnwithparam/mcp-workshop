// The world a check runs against: a fresh copy of the seeded practice system and an empty log, per run.
// Checks read the diary and the log to see what really changed. They never read the model's reply.
import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLOCK, hoursFor, SLOT_STEP, seed, toHHMM, toMin } from "../../world/seed";

let template: string | undefined;
function seeded() {
  if (template && existsSync(template)) return template;
  template = join(mkdtempSync(join(tmpdir(), "harrow-seed-")), "clinic.seed.sqlite");
  seed(template);
  return template;
}

export type World = ReturnType<typeof freshWorld>;

export function freshWorld() {
  const dir = mkdtempSync(join(tmpdir(), "harrow-world-"));
  const db = join(dir, "clinic.sqlite"),
    log = join(dir, "clinic.log");
  copyFileSync(seeded(), db);
  const open = () => new Database(db, { readonly: true });
  return {
    dir,
    db,
    log,
    env: { CLINIC_DB: db, CLINIC_LOG: log },
    clock: CLOCK,
    /** Run one read-only query on the world's diary. */
    rows<T = any>(sql: string, ...params: any[]): T[] {
      const d = open();
      try {
        return d.query(sql).all(...params) as T[];
      } finally {
        d.close();
      }
    },
    /** Write to the world's diary directly, as another member of staff would through the PIMS screen. */
    exec(sql: string, ...params: any[]) {
      const d = new Database(db);
      try {
        d.run(sql, params);
      } finally {
        d.close();
      }
    },
    /** Every PIMS call the server made, in order. */
    calls(): { fn: string; args: any }[] {
      return existsSync(log)
        ? readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((l) => JSON.parse(l))
        : [];
    },
    appointmentCount() {
      return this.rows<{ n: number }>("SELECT COUNT(*) AS n FROM appointments")[0].n;
    },
    /** The true free slots, computed here from the diary rows, independent of the PIMS code. */
    freeSlots(q: { site: string; date?: string; length: number; vetId?: string }) {
      const date = q.date ?? CLOCK.date;
      const hours = hoursFor(q.site, date);
      if (!hours) return [] as { vetId: string; start: string }[];
      const vets = this.rows<{ id: string }>(
        "SELECT id FROM staff WHERE role IN ('vet','director') AND site = ? ORDER BY id",
        q.site,
      ).filter((v) => !q.vetId || v.id === q.vetId);
      const out: { vetId: string; start: string }[] = [];
      for (const v of vets) {
        const busy = this.rows<{ start: string; length: number }>(
          "SELECT start, length FROM appointments WHERE vetId = ? AND date = ? AND status IN ('booked','arrived')",
          v.id,
          date,
        );
        for (let t = toMin(hours[0]); t + q.length <= toMin(hours[1]); t += SLOT_STEP) {
          if (date === CLOCK.date && t < toMin(CLOCK.time)) continue;
          if (busy.some((b) => t < toMin(b.start) + b.length && toMin(b.start) < t + q.length))
            continue;
          out.push({ vetId: v.id, start: toHHMM(t) });
        }
      }
      return out;
    },
  };
}
