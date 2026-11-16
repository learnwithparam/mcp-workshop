# What you hand in

This page tells you what you hand in for each part, and how it is graded. You hand in your fork of this repo. Your
work lives in each step's `problem/` folder.

The checks grade your work, not your words. A rule is yes or no. A rule that says `SKIP` could not run on your
machine, so it does not count as a pass.

## How grading works

Your facilitator clones your fork and runs one command per part. For example, for the diary part:

```bash
bun run verify part give-the-diary
```

Expect: one line per step. At the end, the part says it is done when every step passes.

To grade a whole cohort, the facilitator runs one more command in each fork:

```bash
bun run verify --report
```

Expect: `Wrote verify-report.json: <passing> of 31 steps pass.` It checks every step, so it can take some minutes.

## Each part

| Part                                  | Command                                                     | Steps | You hand in                                                                              |
| ------------------------------------- | ----------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------- |
| Start here                            | `bun run verify part start-here`                            |     1 | The three facts you read off the finished system                                         |
| Give the diary to the model           | `bun run verify part give-the-diary`                        |     4 | Your stdio server with the diary tools, and `.mcp.json`                                  |
| Pick the right tool                   | `bun run verify part pick-the-right-tool`                   |     6 | Tool names, shapes and results, and the eval score before and after                      |
| Open the server safely                | `bun run verify part open-the-server-safely`                |     6 | Token, audience and role checks, and the confirm-before-cancel step                      |
| Defend and ship                       | `bun run verify part defend-and-ship`                       |     6 | Pinned third-party tools, limits, traces, the deployed server and the handover           |
| Grow the server (extension)           | `bun run verify part grow-the-server`                       |     7 | A small client, the lab results tool, two servers behind one front, and a registry entry |
| Route through agentgateway (optional) | `bun run verify part route-tool-calls-through-agentgateway` |     1 | Both servers behind the gateway                                                          |

For example, a Give the diary hand-in is your server and `.mcp.json`. The part passes when its command says every step
passes:

```text
Part give-the-diary:
  PASS   expose-the-diary
  ...
Part give-the-diary is done
```

## Before you hand in

1. Commit and push your fork.
2. Clone it again into a new folder, run `bun install`, and run the part's command there. The facilitator grades a
   fresh clone, so a file you forgot to commit counts as missing.
3. Never commit `.env` or a model key.
