# Route tool calls through agentgateway

## After this part you can

Put two MCP servers behind one gateway with a token rule and a tool allow-list.

## You leave with

An `assignment/config.yaml` with two targets, a token rule and an allow-list.

## The problem

You built a proxy, token checks and a tool allow-list by hand. Teams that run MCP servers in production often use an open-source gateway for this job: one small program you configure, not code you maintain. For example, Joon's token reaches the gateway on port 3000, and he can call only the two read-only tools. The risky `export_all_results` stays out of reach.

## Steps

| Step                              | You produce                                                         | The check reads                                                                            |
| --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `put-servers-behind-agentgateway` | `assignment/config.yaml` with two targets, a token rule, allow-list | the tool list, a call with no token, an allowed call and a blocked call, all via port 3000 |

## Watch and read

| Kind  | Title                                           | Author                         | Why                                                      | Link                                                                                       |
| ----- | ----------------------------------------------- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| video | Building an Agent Gateway to Adopt MCP at Scale | Keith Babo, Solo.io            | Why a team puts one gateway in front of many MCP servers | https://www.youtube.com/watch?v=iKC71inhfNI                                                |
| video | Introducing Agent Gateway                       | Christian Posta, Solo.io       | What agentgateway is and how it secures agent traffic    | https://www.youtube.com/watch?v=SomP92JWPmE                                                |
| read  | MCP authorization                               | agentgateway project docs      | The rules behind the allow-list you write                | https://agentgateway.dev/docs/standalone/latest/documentation/mcp/mcp-authz/               |
| read  | MCP connectivity                                | agentgateway project docs      | How targets and routes fit together                      | https://agentgateway.dev/docs/standalone/latest/documentation/mcp/                         |
| read  | Security best practices                         | Model Context Protocol project | Why a gateway must not pass a token on to a server       | https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices |

## Project

Write a gateway config for two servers you use. Allow one read-only tool from each, require a token, and show that a tool off the list is refused.

## Why it matters

A hand-built proxy is the right way to learn, because you see every decision. It is a poor way to run a clinic. Each
change to it is code to review, test and deploy.

A gateway moves those decisions into one config file. We measured agentgateway idle in Docker. It used
about 14 MiB of memory, and 21 MiB after a few calls. The two course servers beside it used about 85 MiB together.

The diagram shows the plan. It is the same plan as the hand-built proxy.

```mermaid
flowchart LR
  C[Client or MCP Inspector] --> G[agentgateway: token rule and allow-list]
  G -- "token for the clinic address" --> S1[Clinic server]
  G -- "token for the lab address" --> S2[Lab-results server]
```

## What we teach

- How to list two servers as targets behind one address.
- How to require a signed token, and send each server a token made for it.
- How to write an allow-list, so a caller sees only the tools you name.
- How to prove it with a check that calls the gateway as a client.

## What we teach

- How to list two servers as targets behind one address.
- How to require a signed token, and send each server a token made for it.
- How to write an allow-list, so a caller sees only the tools you name.
- How to prove it with a check that calls the gateway as a client.

## Walkthrough

Put both servers behind the gateway:

```bash
bun run verify put-servers-behind-agentgateway
```

Expect: `Done. All 6 rules pass.` once your work meets every Done when line. Before that, each FAIL line has a `Try next:`.

Run the same lines as homework and write `assignment/result.json`:

```bash
bun assignment/check.ts
```

Expect: `Done. Every line passes.` and a new `assignment/result.json` with one `pass` or `fail` per line.

```bash
bun run verify part route-tool-calls-through-agentgateway
```

Expect: `Part route-tool-calls-through-agentgateway is done: 1/1 steps pass.` once the step passes.

## Options

You chose agentgateway. The runner-up is IBM ContextForge.

- **Choose ContextForge when**: you want an admin screen and a registry that tracks many servers.
- **Trade-off**: it has more moving parts than one small program. You run, secure and upgrade more of them.

## Assignment

This part is optional in the live session and expected as homework. The task and the rubric are in
[assignment/README.md](../../assignment/README.md).
