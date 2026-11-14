# Handover: the Harrow Lane MCP server

## Tools

The server has eight tools. A token sees only the tools its scopes allow.

- `find_patient`: finds a patient by pet name, owner name or owner phone. Read-only.
- `find_free_slots`: lists free start times at one site, for each vet. Read-only.
- `vaccines_due`: shows the vaccines a patient has due, soonest first. Read-only.
- `book_appointment`: books one appointment and refuses a clash. Writes, not destructive.
- `move_appointment`: moves an appointment and refuses a clash. Writes, not destructive.
- `cancel_appointment`: cancels an appointment after the person confirms. Destructive.
- `read_notes`: reads a patient's latest clinical notes, own site only. Read-only.
- `controlled_drugs_log`: reads the controlled-drugs register. Read-only.

## Scopes

| Scope         | Allows                                  | Who gets it                |
| ------------- | --------------------------------------- | -------------------------- |
| `diary:read`  | find patients, free slots, vaccines due | every member of staff      |
| `diary:write` | book, move and cancel appointments      | every member of staff      |
| `notes:read`  | clinical notes for your own site        | nurses, vets, the director |
| `drugs:read`  | the controlled-drugs register           | the clinical director only |

## Eval scores

On the 20 front-desk tasks, the server built from the PIMS API scored 12/20. After I shaped the tools around jobs,
it scored 19/20. Both numbers come from `evals/baseline.json` and `evals/designed.json`.

## Threats and defences

- Tool poisoning in a third-party server: `pins.ts` pins every tool's full definition. A changed description, a new
  parameter or a new tool fails the check.
- Prompt injection in a clinical note (the lethal trifecta): no tool lets the model choose an email address, so a
  note cannot send data out.
- A token minted for another server: the server accepts a token only when its audience is exactly `PUBLIC_URL`.
- A receptionist reading clinical notes: `read_notes` is registered only for tokens with `notes:read`.
- A cancel the person did not mean: `cancel_appointment` asks for a confirm first.

## How to deploy

Build the image from the repo root with the `Dockerfile` from `deploy-the-server`. Set `PUBLIC_URL` to the public
address, and let the host set `PORT`. Then run `bun run verify deploy-the-server --url <the public address>`.

## Not done yet

Tokens come from the course's signing key. A real clinic needs its own authorization server. The PIMS is a SQLite
file, so the server runs as one copy only.
