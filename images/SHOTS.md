# Pictures still to capture

`bun run shots` makes every terminal picture in the course. It runs the real commands and captures what they print.

One picture needs a real host and a signed-in account. The build machine had neither, so a person must capture it:

| Picture                                                                                         | Where it goes                                                   | How to capture it                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code answering "Who can see Biscuit at Millbrook?" with the `find_free_slots` call shown | `parts/01-give-the-diary/04-connect-claude/images/expected.png` | In `parts/01-give-the-diary/04-connect-claude/solution`, run `claude`, approve `harrow-lane`, ask the question, and screenshot the terminal at 800 pixels wide. Then set `screen = true` in that step's `step.toml` and show the image in its README. |

Until then, the step shows a Mermaid diagram of the same flow. Its `screen` is `false`, so `bun run check` passes.
