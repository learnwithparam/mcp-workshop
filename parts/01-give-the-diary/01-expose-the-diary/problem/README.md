# Expose the diary

## The problem

The Millbrook front desk hears "when can you see my dog?" all day. Staff click into the PIMS, pick a vet and scan the
diary. Claude cannot see it. For example, the PIMS search `clinic.freeSlots` finds 6 free slots, but no model can call it.

## Watch it done

The starter has no tool. Real output of the check:

```text
  FAIL  tools/list has a tool called find_free_slots
  FAIL  Its description is one to three sentences of at least 8 words
  FAIL  It takes site and length, and every argument has a description
  FAIL  For Millbrook and 20 minutes it returns exactly the free slots in the diary
  FAIL  It reads the live diary: a slot booked behind its back disappears from the next answer
3 of 8 rules pass. Fix the FAIL lines and run it again.
```

The sample solution ends with `Done. All 8 rules pass.` and answers like this:

![The tool answering for Millbrook](../images/expected.png)

## Your turn

1. In `server.ts`, import `z` from `zod/v4` and `clinic` from `#clinic` (short for `world/clinic.ts`).
2. Register `find_free_slots` with `server.registerTool(name, { description, inputSchema }, handler)`.
3. Give it a Zod object: `site` (`harrow-lane`, `millbrook` or `eastgate`), an optional `date`, and a `length`
   that defaults to 20. Put `.describe("...")` on every field.
4. In the handler, call `clinic.freeSlots({ site, date, length })` on every call and return each time and vet as
   text. Without `date`, use `clinic.clock().date`.
5. Log only with `console.error`. Over stdio, stdout belongs to the protocol.
6. Try it as a client does.

```bash
bun run try find_free_slots '{"site":"millbrook"}' --server parts/01-give-the-diary/01-expose-the-diary/problem
```

Expect: six start times, three for Dr Sam Reyes and three for Dr Hannah Cole. The starter says
`The server broke the MCP rules: Method not found.`

## Do it on your work

Do the same on one read action of your own system, such as "list open tickets". Good looks like a clear description,
a described argument for each input, and an answer read live each time, never copied.

## Done when

- The server starts over stdio, writes nothing to stdout before a request, and answers `server/discover`.
- `tools/list` has `find_free_slots` with a description of one to three sentences.
- It takes `site` and `length`, and every argument has a description.
- For Millbrook and 20 it returns exactly the free slots in the diary, and a slot booked behind its back disappears.

```bash
bun run verify expose-the-diary
```

Expect: `Done. All 8 rules pass.`

## Solution

The after state is a `server.ts` with one registered tool. See `solution/server.ts`.

## If you get stuck

- `inputSchema` is the only schema you write. The SDK checks every call against it.
- Old tutorials use `server.tool(...)` and `@modelcontextprotocol/sdk`. That is the old SDK. Use `registerTool` from
  `@modelcontextprotocol/server`.
- Guide: [Build your first server](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server).

## Go further

The check reads stdout before any request. A banner there passes the SDK client, but it breaks other hosts.

## Words you will use

- **stdio**: standard input and output. The host starts your server and talks JSON-RPC to it over stdin and stdout.
- **`tools/list`**: the request a host sends to learn your tools and their argument schemas.
- **`server/discover`**: the first request in the current spec revision. The server says what it supports.
- **Zod**: the TypeScript schema library the SDK uses for tool arguments.
