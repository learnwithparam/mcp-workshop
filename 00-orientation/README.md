# Start here

In this page you set up the repo and meet Harrow Lane Veterinary. Then you run the finished server and see the
goal. It takes about 15 minutes, and you need no API key.

## Set up

Install [Bun](https://bun.sh). Bun runs TypeScript and installs packages. Then, in the repo folder, run:

```bash
bun install
```

Expect: `bun install` ends with no errors.

## Meet the world

Harrow Lane Veterinary is a made-up group of three clinics for small animals: Harrow Lane, Millbrook and Eastgate.
Its practice system is called the PIMS. The PIMS holds the diary, 600 patients and their owners. It also holds
clinical notes, vaccines and the controlled-drugs register (the log of strong drugs the law tracks).

The PIMS lives in `world/`. The file `world/clinic.ts` is the PIMS's API: the functions your server calls. The data
is a SQLite file built from a fixed seed. So every learner sees the same diary.

```bash
bun run world
```

Expect: `Harrow Lane Veterinary: 3 sites, 12 staff, 400 owners, 600 patients.` and a line that ends `6 free 20-minute slots.`

For example, the last line of that output reads: `Biscuit (P-0001, Labrador, Millbrook) has a booster due.` You
meet Biscuit again in many steps. The clinic clock is fixed at 2026-11-16 08:00, so "today" never changes.

You meet three people:

- Ola Nowak, receptionist at Millbrook. She books and moves appointments.
- Dr Sam Reyes, vet at Millbrook. A vet reads notes only for the patients at their own site.
- Joon Park, clinical director. Only Joon reads the controlled-drugs register.

You can change the diary while you try things. `bun run world reset` puts it back.

## Run the finished system and see the goal

The first step is `meet-the-clinic`. In it you run the finished server and write down three facts. Its README is
[parts/00-start-here/01-meet-the-clinic/problem/README.md](../parts/00-start-here/01-meet-the-clinic/problem/README.md).
Before you start, run its check once to see what a first run looks like:

```bash
bun run verify meet-the-clinic
```

Expect: four `FAIL` lines, each with a `Try next:` line. Every step starts failing; the check tells you what to do.

![Your first run: the world, then every rule failing with what to try next](images/first-run.png)

For example, one line says `Try next: run: bun run try find_free_slots '{"site":"millbrook"}'`. Run that command
and the answer starts to appear.

## If you are a product manager

You can do the whole course without writing TypeScript. Run each step's sample answer with
`bun run verify <step-name> solution`. Read the diagrams. Do the written steps yourself: `meet-the-clinic`,
`connect-claude`, and later the eval and the handover.

## Using a real model

The course works with no model key. To try a live model:

1. Copy `.env.example` to `.env`.
2. Set `LLM_PROVIDER` to `anthropic`, `openrouter`, `openai` or `ollama`.
3. Fill in the key for that one provider.

Then run `bun run models`. It makes one tiny call for each role and prints pass or fail. The checks never need a key.

When a command prints something you do not expect, look it up in [troubleshooting.md](troubleshooting.md).
