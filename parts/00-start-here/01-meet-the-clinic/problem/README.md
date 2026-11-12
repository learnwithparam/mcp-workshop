# Meet the clinic

## The problem

Harrow Lane Veterinary runs three small-animal clinics: Harrow Lane, Millbrook and Eastgate. Twelve staff share
one practice system: the diary, the patients, the owners, the clinical notes and the controlled-drugs register.
The front desk wants to ask Claude "can Biscuit get her booster?" instead of clicking through five screens. The
clinical director wants one promise first: nobody sees what their role should not see.

Before you build anything, see the finished server work, and see the one refusal that matters most.

## Your challenge

Run the finished system and fill in `answers.md` in this folder with three facts you read off the screen.

```bash
bun run world
```

Expect: `Harrow Lane Veterinary: 3 sites, 12 staff, 400 owners, 600 patients.` and two more lines about the diary.

```bash
bun run ask "Can Biscuit get her booster at Millbrook?"
```

Expect: three `tool` lines (`find_patient`, `vaccines_due`, `find_free_slots`) and an `Answer (as ola, provider replay):` line.

![The front-desk agent answering from the finished server](../images/expected.png)

```bash
bun run try find_free_slots '{"site":"millbrook"}'
```

Expect: `Result from find_free_slots:` and one line per vet with their free start times.

```bash
bun run ask "Show me Biscuit's clinical notes."
bun run ask "Show me Biscuit's clinical notes." --as sam
```

Expect: Ola (receptionist) gets no notes; Dr Sam Reyes (vet) gets a `read_notes` call and the notes.

Now write the answers:

- How many free 20-minute slots does Millbrook have?
- What is Dr Sam Reyes's first free slot?
- What does Ola get when she asks for clinical notes?

If you already know MCP well, read `world/finished/server.ts` now: it is the server you will have built by the end.

## Done when

- `answers.md` has an answer on each of the three lines.
- The number of free 20-minute slots at Millbrook matches the diary.
- Dr Sam Reyes's first free slot matches the diary.
- Ola's line says she is refused: a receptionist cannot read clinical notes.

```bash
bun run verify meet-the-clinic
```

Expect: `Done. All 4 rules pass.` once your work meets every Done when line. Before that, each FAIL line has a `Try next:`.

## If you get stuck

- `bun run try` with no arguments lists the tools Ola can see. Add `--as sam` or `--as joon` to compare.
- The answers come from the diary, so they are the same on every machine. If yours differ, run `bun run world reset`.
- No API key is needed. `bun run ask` plays back recorded model turns (the `replay` provider). To ask your own
  questions, set `LLM_PROVIDER` and one key in `.env` (see `.env.example`), then run `bun run models`.

## Words you will use

- **MCP server**: a program that offers tools to an AI app (the host) in a standard way, so any MCP host can use them.
- **Tool**: one action the model may call, with a name, a description and a schema for its arguments.
- **Host**: the app the person talks to, such as Claude Code or Claude Desktop. It runs the model and calls the tools.
- **PIMS**: practice management system, the clinic's system of record. Here it is `world/clinic.ts` on a SQLite file.
- **Token**: here, a signed access token that says who is calling and what they may do (their scopes).
- **Replay**: a model provider that plays back recorded turns, so the course runs with no key and no cost.
