# Book an appointment

## The problem

Reading the diary is safe. Writing is not. The PIMS lets staff double-book a vet on purpose. So
`clinic.createAppointment` writes whatever it gets.

For example, Claude books Biscuit at 10:20. Dr Reyes already has a dog at 10:20. Without a check, the diary shows two bookings in one slot. The check stops the second one.

```mermaid
sequenceDiagram
  participant H as Host (Claude)
  participant S as Your server
  participant P as PIMS
  H->>S: tools/call book_appointment
  S->>P: appointments({ vetId, date })
  alt overlaps a booked or arrived row
    S-->>H: isError: true, no write
  else free
    S->>P: createAppointment(...)
    S-->>H: Booked A-01962
  end
```

## Watch it done

The starter has no booking tool. This is real output:

```text
  FAIL  tools/list has book_appointment with patientId, vetId, start and reason
  FAIL  Booking Biscuit with Dr Reyes at 10:20 adds exactly one matching row to the diary
  FAIL  A slot freed by a cancellation can be booked (Dr Reyes at 11:40)
  FAIL  Booking a time that is already taken adds no row and returns isError: true
  FAIL  A booking that starts in the middle of another appointment is refused too (Dr Reyes at 10:30)
  FAIL  Arguments that fail the schema come back as a tool error the model can read, and add no row
1 of 7 rules pass. Fix the FAIL lines and run it again.
```

The sample solution ends with `Done. All 7 rules pass.`

## Your challenge

1. Add `book_appointment(patientId, vetId, date?, start, length, reason)` to `server.ts`.
2. Read the vet's rows with `clinic.appointments({ vetId, date })`. Keep only the rows that are `booked` or `arrived`.
3. Two appointments clash when each one starts before the other ends. Compare minutes, not text.
4. On a clash, return `{ content: [...], isError: true }`. Write nothing. Otherwise, call `clinic.createAppointment(...)` once.
5. Give `start` a Zod rule for `HH:MM`. The SDK then refuses bad input first.
6. Run it twice.

```bash
bun run try book_appointment '{"patientId":"P-0001","vetId":"S-05","start":"10:20","reason":"Booster"}' --server parts/01-give-the-diary/02-book-an-appointment/problem
```

Expect: first `Booked A-01962: 10:20 on 2026-11-16.`, then a tool error that says `Clash`. Undo it with `bun run world reset`.

## Done when

- `tools/list` has `book_appointment` with `patientId`, `vetId`, `start` and `reason`.
- Biscuit with Dr Reyes at 10:20 adds exactly one row. A freed slot at 11:40 can be booked.
- A taken time, or a time that starts mid-appointment (10:30), adds no row and returns `isError: true`.
- Arguments that fail the schema come back as a tool error and add no row.

```bash
bun run verify book-an-appointment
```

Expect: `Done. All 7 rules pass.`

## If you get stuck

- The check uses a fresh diary. Your test bookings never break it.
- A tool error (`isError: true`) is a normal result. The model reads it. A protocol error goes to the host's code. The model never sees it.

## Do it on your work

Do the same for one write action in your own system. List what would make a write wrong, such as a double
booking. A good write tool checks before it writes, and it refuses a clash.

## Solution

The finished state is `server.ts` with a second tool. It has a clash check before the write. See `solution/server.ts`.

## Go further

Read the picture above again after you write your code.

## Words you will use

- **Tool error**: a reply with `isError: true`. Its text explains the failure to the model.
- **Clash**: two appointments for one vet whose times overlap.
