# Assignment: put both servers behind agentgateway

This is optional in the live session and expected as homework. It is the closing part,
[Route tool calls through agentgateway](../parts/06-route-tool-calls-through-agentgateway/README.md).

## The task

Put the clinic server and the lab server behind one agentgateway, with a token rule and an allow-list.

The folder has everything you need:

- `compose.yml` starts the gateway, the clinic server and the lab server. Do not edit it.
- `config.yaml` is the starter. It has one target and no token rule. This is the only file you change.
- `token.ts` makes a fresh test key and tokens in `.run/`. They are never committed.
- `check.ts` tests every Done when line and writes `result.json`.

Start the stack and open the gateway in the MCP Inspector:

```bash
bun assignment/token.ts && docker compose -f assignment/compose.yml up -d
```

Expect: a line that says it wrote the test key and tokens, and then three containers started.

```bash
npx @modelcontextprotocol/inspector@2.15.0
```

Expect: the Inspector prints a local address. It needs a recent Node. Connect to `http://127.0.0.1:3000/mcp` with the token in `.run/caller.token`.

Stop everything when you are done:

```bash
docker compose -f assignment/compose.yml down -v
```

Expect: the three containers and the network are removed.

## Done when

- The gateway image tag is `v1.7.0`.
- `tools/list` through the gateway shows tools from both servers.
- A request with no token is refused with 401.
- The allowed tool returns real free slots.
- A tool that is not on the allow-list returns an error.
- The tools list shows only the allowed tools.

Run the check. It starts and stops the stack for you:

```bash
bun assignment/check.ts
```

Expect: `Done. Every line passes.` and an `assignment/result.json` with one `pass` or `fail` per line, plus the gateway version it found.

## Hand in

Push a branch named `assignment` and submit its URL. The grader runs the same `check.ts`.

Add a short `CHOICE.md`. Say when you would pick IBM ContextForge instead of agentgateway.

## Rubric

A person reads these three lines. There are no points.

1. Your allow-list has a stated least-privilege reason for each tool you allowed.
2. No secret is committed. Keys and tokens stay in `.run/`.
3. `CHOICE.md` names a real case for ContextForge and its trade-off.
