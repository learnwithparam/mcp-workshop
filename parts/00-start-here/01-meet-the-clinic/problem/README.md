# Meet the clinic

## The problem

Harrow Lane Veterinary has three clinics for small animals: Harrow Lane, Millbrook and Eastgate. Twelve staff share
one practice system. It holds the diary, the patients, the owners, the clinical notes and the controlled-drugs register.

The front desk wants to ask Claude "can Biscuit get her booster?". Today they click through five screens instead.
The clinical director wants one promise first: nobody sees what their role should not see.

Before you build anything, you watch the finished server work. You also see the one refusal that matters most.

## Your challenge

Run the finished system. Then fill in `answers.md` in this folder with three facts you read on the screen.

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

For example, `bun run try` with no arguments shows the tools that Ola, the receptionist, may use. It starts like this:

```text
The finished server, as ola, has 6 tool(s):
  find_patient: Find a patient by pet name, owner name or owner phone. ...
  find_free_slots: List free appointment start times at one clinic site, for each vet. ...
```

Now write the answers:

- How many free 20-minute slots does Millbrook have?
- What is Dr Sam Reyes's first free slot?
- What does Ola get when she asks for clinical notes?

Do you already know MCP well? Then read `world/finished/server.ts` now. It is the server you build in this course.

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

- Add `--as sam` or `--as joon` to `bun run try` to see the tools of other staff.
- The answers come from the diary, so they are the same on every computer. Different answers? Run `bun run world reset`.
- You need no API key. `bun run ask` plays back recorded model turns (the `replay` provider). To ask your own
  questions, set `LLM_PROVIDER` and one key in `.env` (see `.env.example`). Then run `bun run models`.

## Words you will use

- **MCP server**: a program that offers tools to an AI app (the host) in a standard way. Any MCP host can use them.
- **Tool**: one action the model may call. It has a name, a description and a schema for its arguments.
- **Schema**: the rules for the arguments, for example "`site` is one of three names".
- **Host**: the app the person talks to, such as Claude Code or Claude Desktop. It runs the model and calls the tools.
- **PIMS**: practice management system, the clinic's main record. Here it is `world/clinic.ts` on a SQLite file.
- **Token**: here, a signed pass that says who is calling and what they may do (their scopes).
- **Replay**: a model provider that plays back recorded turns. So the course runs with no key and no cost.
