# Connect Claude

## The problem

Ola at the Millbrook desk will not type JSON into a terminal. She asks Claude, a host: the app a person talks to.
For example, "Who can see Biscuit?" only works if the host has one file that says how to start your server.

## Watch it done

With no `.mcp.json` and no notes, the check fails. Real output:

```text
  FAIL  .mcp.json names one server under mcpServers, with a command
  FAIL  Starting that exact command gives a working MCP server
  FAIL  That server lists find_free_slots and book_appointment
  FAIL  notes/connect-claude.md has the question and Claude's answer
  FAIL  The answer names a Millbrook vet and at least one real free slot
  FAIL  Every time in the answer is a free slot in the diary (nothing made up)
0 of 6 rules pass. Fix the FAIL lines and run it again.
```

On the sample solution it ends with `Done. All 6 rules pass.`

```mermaid
flowchart LR
  H[Host] -- "reads .mcp.json, starts bun server.ts" --> S[Your server] --> P[(PIMS diary)]
```

## Your turn

1. Create `.mcp.json` in this folder:

   ```json
   { "mcpServers": { "harrow-lane": { "command": "bun", "args": ["server.ts"] } } }
   ```

2. Run the command from your config yourself.

```bash
cd parts/01-give-the-diary/04-connect-claude/problem && bun server.ts
```

Expect: one line that says the server is running on stdio, then nothing. Press Ctrl+C to stop it.

3. Connect a host. In Claude Code, open a terminal in this folder, run `claude`, approve `harrow-lane`, and check
   it with `/mcp`. Claude Desktop needs the same entry in its own config, with full paths.
4. Ask: "Who can see Biscuit at Millbrook?"
5. Paste the whole answer after `Answer:` in `notes/connect-claude.md`.

Expect: Claude calls `find_free_slots` and names Dr Sam Reyes and Dr Hannah Cole with real times.

## Do it on your work

Write the same `.mcp.json` entry for your own server from the project in the part README. Ask one real question of
your own system. Good looks like the host starting your server by itself, and every fact in the answer matching the
live system.

## Done when

- `.mcp.json` names one server under `mcpServers`, with a command.
- Starting that exact command gives a working MCP server.
- That server lists `find_free_slots` and `book_appointment`.
- `notes/connect-claude.md` has the question and Claude's answer.
- The answer names a Millbrook vet and a real free slot, and every time in it is free in the diary.

```bash
bun run verify connect-claude
```

Expect: `Done. All 6 rules pass.`

## Solution

The after state is a `.mcp.json` and a notes file. See `solution/server.ts` and `solution/notes/connect-claude.md`.

## If you get stuck

- Claude says it cannot see the diary: the server is not connected. In Claude Code, run `/mcp`. In Claude Desktop,
  open Settings, Developer, and read the server's log.
- The answer has times that are not free: you booked some while you tested. Run `bun run world reset`.

## Go further

Claude Desktop does not start in this folder. Use full paths in `"args"`. If it cannot find `bun`, put the path that
`which bun` prints in `"command"`. Any MCP host works. The check reads only `.mcp.json` and your notes.

## Words you will use

- **`.mcp.json`**: a project file that lists MCP servers and the command that starts each one. Claude Code reads it.
- **Working directory**: the folder a command runs in. A relative path such as `server.ts` is read from there.
