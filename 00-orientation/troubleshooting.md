# When something goes wrong

Every message a script prints on failure is in this table.

| What you see | What it means | Fix |
|---|---|---|
| `bun: command not found` | Bun is not installed. | Install it from bun.sh, then open a new terminal. |
| `There is no step called "..."` | The step name is misspelled. | Copy a name from the list it prints. |
| `There is no part called "..."` | The part name is misspelled. | Copy a name from the list it prints, for example `give-the-diary`. |
| `ERROR the check for ... could not load` | The check itself is broken, not your work. | Open an issue with the full output. |
| `FAIL` and `Try next: ...` | One rule of the step does not hold yet. | Do what the `Try next` line says, then run the check again. |
| `The checker saw: the server did not answer within 15 seconds` | Your server started but never spoke MCP, or it waits for something. | Run `bun server.ts` in the folder; it should print its banner to stderr and wait. |
| `The checker saw: Connection closed Server said: ...` | Your server crashed on start. The end of its error follows. | Run `bun server.ts` in the folder and fix the first error. |
| `Client.listTools() called but server does not advertise tools capability` | The server has no tools yet. | Register a tool with `server.registerTool`. |
| `Could not connect: ...` from `bun run try` | The server in `--server <folder>` did not start. | Run `bun server.ts` in that folder and read its error. |
| `Protocol error: Tool ... not found` | The server has no tool by that name, or your role cannot see it. | Run `bun run try` with no tool name to list the tools, or add `--as sam` or `--as joon`. |
| `The arguments are not valid JSON` | The tool arguments are not JSON. | Wrap them in single quotes: `'{"site":"millbrook"}'`. |
| `Tool error from ...` | The tool refused the call and says why. | Read the message; it names the field and the fix. |
| `There is no recorded reply for "..."` | With `LLM_PROVIDER=replay`, only recorded questions have answers. | Run `bun run ask` with no question to list them, or set a provider and key in `.env`. |
| `... is not set. Add it to .env (see .env.example), or use LLM_PROVIDER=replay.` | You chose a live provider without its key. | Add the key to `.env`, or set `LLM_PROVIDER=replay`. |
| `LLM_PROVIDER="..." is not one of replay, anthropic, openrouter, openai, ollama` | The provider name is misspelled. | Use one of the five names. |
| `FAIL  provider ..., role ...` from `bun run models` | The provider rejected the call or the key. | Check the key and the provider's status page; the line shows its error. |
| `The agent failed: ...` | The live model or a tool call broke mid-conversation. | Run it again; if it repeats, run `bun run models`. |
| `The diary has changed since the seed. Run: bun run world reset` | Bookings you made while trying tools are still in the diary. | Run `bun run world reset`. |
| `EADDRINUSE` from `bun run finished` | Port 8787 is in use. | Set `MCP_PORT` in `.env` to a free port. |
| `The browser could not run.` from `bun run shots` | Playwright's Chromium is missing. | Run `bunx playwright install chromium`. |
