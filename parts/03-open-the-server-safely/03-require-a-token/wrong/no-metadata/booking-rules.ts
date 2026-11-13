// Booking rules the server applies before it writes to the PIMS.
// Each error names the field and says what to do next, so a model can fix its own call.
import { clinic, type Staff } from "#clinic";

type Booking = {
  patientId: string;
  vetId: string;
  date: string;
  start: string;
  length: number;
  // An appointment to leave out of the clash check: the one being moved.
  ignore?: string;
};

function minutesSinceMidnight(clockTime: string): number {
  const [hours, minutes] = clockTime.split(":").map(Number);
  return hours * 60 + minutes;
}

// Returns a message that explains what is wrong, or undefined when the booking is fine.
export function checkBooking(booking: Booking): string | undefined {
  if (!clinic.patient(booking.patientId))
    return (
      `No patient with patientId "${booking.patientId}". ` +
      "Look the id up with find_patient before booking."
    );
  const vet = clinic.staffMember(booking.vetId);
  if (!vet || (vet.role !== "vet" && vet.role !== "director"))
    return (
      `No vet with vetId "${booking.vetId}". ` +
      "Vet ids look like S-05; find_free_slots lists them."
    );
  return (
    pastStartProblem(booking) ?? openingHoursProblem(booking, vet) ?? clashProblem(booking, vet)
  );
}

function pastStartProblem(booking: Booking): string | undefined {
  const now = clinic.clock();
  const isPastDate = booking.date < now.date;
  const isEarlierToday = booking.date === now.date && booking.start < now.time;
  if (!isPastDate && !isEarlierToday) return undefined;
  return (
    `The start ${booking.date} ${booking.start} is in the past. ` +
    `The clinic clock reads ${now.date} ${now.time}; pick a later start.`
  );
}

function openingHoursProblem(booking: Booking, vet: Staff): string | undefined {
  const hours = clinic.openingHours(vet.site, booking.date);
  if (!hours)
    return (
      `${vet.site} is closed on ${booking.date}. ` +
      "Pick another date; find_free_slots shows open times."
    );
  const end = minutesSinceMidnight(booking.start) + booking.length;
  const isOutsideHours = booking.start < hours.open || end > minutesSinceMidnight(hours.close);
  if (!isOutsideHours) return undefined;
  return (
    `${booking.start} is outside ${vet.site} opening hours on ${booking.date}: ` +
    `it opens at ${hours.open} and closes at ${hours.close}.`
  );
}

function clashProblem(booking: Booking, vet: Staff): string | undefined {
  const start = minutesSinceMidnight(booking.start);
  const end = start + booking.length;
  const vetDiary = clinic.appointments({ vetId: vet.id, date: booking.date });
  const activeAppointments = vetDiary.filter(
    (appointment) =>
      appointment.id !== booking.ignore &&
      (appointment.status === "booked" || appointment.status === "arrived"),
  );
  // Two appointments overlap when each one starts before the other ends.
  const clash = activeAppointments.find((appointment) => {
    const appointmentStart = minutesSinceMidnight(appointment.start);
    return start < appointmentStart + appointment.length && appointmentStart < end;
  });
  if (!clash) return undefined;
  const freeSlots = clinic.freeSlots({
    site: vet.site,
    date: booking.date,
    length: booking.length,
    vetId: vet.id,
  });
  const freeStarts = freeSlots.map((slot) => slot.start);
  const suggestions = freeStarts.slice(0, 6).join(", ") || "none on this date";
  return (
    `${vet.name} is booked at ${clash.start} for ${clash.length} minutes, ` +
    `which clashes with ${booking.start}. Free slots: ${suggestions}.`
  );
}
