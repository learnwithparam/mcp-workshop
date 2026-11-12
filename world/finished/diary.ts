// Booking rules the finished server applies before it writes to the PIMS.
// Each error names the field and says what to do next, so a model can fix its own call.
import { clinic } from "#clinic";

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export function checkBooking(a: { patient_id: string; vet_id: string; date: string; start: string; length: number; ignore?: string }): string | undefined {
  const patient = clinic.patient(a.patient_id);
  if (!patient) return `No patient with patient_id "${a.patient_id}". Look the id up with find_patient before booking.`;
  const vet = clinic.staffMember(a.vet_id);
  if (!vet || (vet.role !== "vet" && vet.role !== "director")) return `No vet with vet_id "${a.vet_id}". Vet ids look like S-05; find_free_slots lists them.`;
  const now = clinic.clock();
  if (a.date < now.date || (a.date === now.date && a.start < now.time)) return `The start ${a.date} ${a.start} is in the past. The clinic clock reads ${now.date} ${now.time}; pick a later start.`;
  const hours = clinic.openingHours(vet.site, a.date);
  if (!hours) return `${vet.site} is closed on ${a.date}. Pick another date; find_free_slots shows open times.`;
  if (a.start < hours.open || toMin(a.start) + a.length > toMin(hours.close)) return `${a.start} is outside ${vet.site} opening hours on ${a.date}: it opens at ${hours.open} and closes at ${hours.close}.`;
  const s = toMin(a.start), e = s + a.length;
  const clash = clinic.appointments({ vet_id: vet.id, date: a.date })
    .filter((x) => x.id !== a.ignore && (x.status === "booked" || x.status === "arrived"))
    .find((x) => s < toMin(x.start) + x.length && toMin(x.start) < e);
  if (clash) {
    const free = clinic.freeSlots({ site: vet.site, date: a.date, length: a.length, vet_id: vet.id }).map((f) => f.start);
    return `${vet.name} is booked at ${clash.start} for ${clash.length} minutes, which clashes with ${a.start}. Free slots: ${free.slice(0, 6).join(", ") || "none on this date"}.`;
  }
  return undefined;
}
