# Picks candidates

For the page pass. Each part lists 8 to 10 candidates. Cut each part to 4 to 6, with at least 2 videos, then delete
this file. The bar is section 5 of STANDARD-v2. A pick is made by the person or team who made the method or runs it. It is about the idea, not a launch. It is never a listicle, an SEO site, a content farm or a paywall.

Notes for the page pass: I wrote these from memory and could not open the links from the build session. Years are the
year I believe each piece came out. Check every link and date with the nightly oEmbed check before you keep a pick.
A pick marked "video" must be checked first, because titles change.

## 00 Start here

| Pick                                                       | Author, year                               | Kind  | Why it passes                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------- |
| Introduction to the Model Context Protocol                 | The MCP project, docs, kept current        | read  | The official docs from the team that owns the protocol, and it is about the idea.               |
| Architecture overview                                      | The MCP project, docs, kept current        | read  | The official page that names hosts, clients and servers, written by the spec authors.           |
| Building effective agents                                  | Anthropic engineering, 2024                | read  | Written by the team that runs agents in production. It explains why a tool beats a long prompt. |
| Writing effective tools for agents                         | Anthropic engineering, 2025                | read  | The makers of MCP explain what a good tool is, with measured results.                           |
| Building agents with the Model Context Protocol (workshop) | Mahesh Murag, Anthropic, AI Engineer, 2025 | video | A talk by an MCP maintainer at a major conference. Check the title.                             |
| Connect Claude Code to tools via MCP                       | Anthropic, Claude Code docs                | read  | The product docs for the host the learner uses in step four.                                    |
| MCP Inspector                                              | The MCP project, repo and docs             | read  | The official debugging tool, from the team that made the protocol.                              |
| Effective context engineering for AI agents                | Anthropic engineering, 2025                | read  | Explains why every tool costs context, from the team that measured it.                          |

## 01 Give the diary

| Pick                                                       | Author, year                               | Kind  | Why it passes                                                      |
| ---------------------------------------------------------- | ------------------------------------------ | ----- | ------------------------------------------------------------------ |
| Build an MCP server                                        | The MCP project, docs                      | read  | The official guide to the exact task of the part.                  |
| Tools (specification page)                                 | The MCP project, spec                      | read  | The source of truth for tool names, results and errors.            |
| Writing effective tools for agents                         | Anthropic engineering, 2025                | read  | Covers error messages a model can act on, the heart of step three. |
| Building agents with the Model Context Protocol (workshop) | Mahesh Murag, Anthropic, AI Engineer, 2025 | video | Live build of a server by an MCP maintainer. Check the title.      |
| Transports (specification page)                            | The MCP project, spec                      | read  | Explains why stdout must carry only protocol messages.             |
| Lifecycle (specification page)                             | The MCP project, spec                      | read  | The official account of start up and version negotiation.          |
| TypeScript SDK docs                                        | The MCP project, repo                      | read  | The SDK the course pins, from its own makers.                      |
| Connect Claude Code to tools via MCP                       | Anthropic, Claude Code docs                | read  | Shows `.mcp.json`, the file learners write in step four.           |

## 02 Pick the right tool

| Pick                                                       | Author, year                               | Kind  | Why it passes                                                               |
| ---------------------------------------------------------- | ------------------------------------------ | ----- | --------------------------------------------------------------------------- |
| Writing effective tools for agents                         | Anthropic engineering, 2025                | read  | Describes the eval loop and the cut from many tools to few.                 |
| Introducing advanced tool use                              | Anthropic engineering, 2025                | read  | Measured token cost of tool definitions, from the team that ran it.         |
| Code execution with MCP                                    | Anthropic engineering, 2025                | read  | A production result: 150,000 tokens down to 2,000.                          |
| Effective context engineering for AI agents                | Anthropic engineering, 2025                | read  | The idea behind small, sharp tool lists.                                    |
| Tool annotations (specification page)                      | The MCP project, spec                      | read  | The official meaning of the read-only and destructive hints.                |
| Resources (specification page)                             | The MCP project, spec                      | read  | Source of truth for step five.                                              |
| Demystifying evals for AI agents                           | Anthropic engineering, 2026                | read  | Written by the team that runs evals. Check that it exists under this title. |
| Building agents with the Model Context Protocol (workshop) | Mahesh Murag, Anthropic, AI Engineer, 2025 | video | Shows tool design choices live. Check the title.                            |
| Berkeley Function Calling Leaderboard                      | UC Berkeley Gorilla team, paper 2024       | read  | The group that made the benchmark explains how tool choice is scored.       |

## 03 Open the server safely

| Pick                                                  | Author, year                           | Kind  | Why it passes                                                          |
| ----------------------------------------------------- | -------------------------------------- | ----- | ---------------------------------------------------------------------- |
| Authorization (specification page)                    | The MCP project, spec                  | read  | The official rules for tokens, audiences and metadata.                 |
| RFC 9728, OAuth Protected Resource Metadata           | IETF, 2025                             | read  | The standard the 401 challenge points to, by its authors.              |
| RFC 8707, Resource Indicators for OAuth 2.0           | IETF, 2020                             | read  | The standard behind the token audience.                                |
| RFC 7636, Proof Key for Code Exchange                 | IETF, 2015                             | read  | The original standard for PKCE.                                        |
| OAuth 2.0 for browser based apps and OAuth.net guides | Aaron Parecki, oauth.net, kept current | read  | By a main author of the OAuth standards.                               |
| Understanding MCP authorization (talk)                | Den Delimarsky, Anthropic, 2025        | video | A maintainer of the MCP auth spec. Check that it exists and the title. |
| Security best practices (specification page)          | The MCP project, spec                  | read  | Names the confused deputy and token passthrough problems.              |
| Transports, Streamable HTTP (specification page)      | The MCP project, spec                  | read  | The official rules for the Host check and sessions.                    |
| Elicitation (specification page)                      | The MCP project, spec                  | read  | Source of truth for step six.                                          |

## 04 Defend and ship

| Pick                                                                 | Author, year                            | Kind | Why it passes                                                                            |
| -------------------------------------------------------------------- | --------------------------------------- | ---- | ---------------------------------------------------------------------------------------- |
| The lethal trifecta for AI agents                                    | Simon Willison, 2025                    | read | He coined the term and explains the method. A personal blog, but the origin of the idea. |
| MCP security notification: tool poisoning attacks                    | Invariant Labs, 2025                    | read | The team that found and named the attack, with working examples.                         |
| Jumping the line: how MCP servers can attack you before you use them | Trail of Bits, 2025                     | read | A respected security firm's own research on poisoned descriptions.                       |
| MCP security best practices                                          | The MCP project, spec                   | read | The official defence list.                                                               |
| Code execution with MCP                                              | Anthropic engineering, 2025             | read | The data tokenizing idea, from the team that ran it.                                     |
| OpenTelemetry semantic conventions for generative AI and MCP         | OpenTelemetry project, docs             | read | The standard behind the span names and labels in the tracing step.                       |
| OpenTelemetry concepts: traces and spans                             | OpenTelemetry project, docs             | read | The official plain explanation of a span.                                                |
| Addressing cascading failures                                        | Google SRE book, Beyer and others, 2016 | read | The team that runs the systems explains deadlines and load shedding.                     |
| Scaling your API with rate limiters                                  | Paul Tarjan, Stripe engineering, 2017   | read | A company that runs a huge API explains rate limits from production.                     |
| Dockerfile best practices                                            | Docker, docs                            | read | The official guide for the deploy step.                                                  |

## 05 Grow the server

| Pick                                                       | Author, year                                     | Kind  | Why it passes                                                            |
| ---------------------------------------------------------- | ------------------------------------------------ | ----- | ------------------------------------------------------------------------ |
| Tasks (specification page)                                 | The MCP project, spec                            | read  | The official account of calls that finish later.                         |
| MCP Registry docs                                          | The MCP project, docs                            | read  | How to publish a `server.json`, from the registry team.                  |
| Authorization, client registration (specification page)    | The MCP project, spec                            | read  | Covers Client ID Metadata Documents for clients.                         |
| OAuth Client ID Metadata Document (draft)                  | Aaron Parecki and Emelia Smith, IETF draft, 2025 | read  | By the authors of the method. Say that it is a draft.                    |
| RFC 9207, Authorization Server Issuer Identification       | IETF, 2022                                       | read  | The standard that defines the `iss` check.                               |
| OAuth 2.0 mix up attacks                                   | Oauth.net, kept current                          | read  | Explains why the `iss` check exists.                                     |
| Server side request forgery prevention cheat sheet         | OWASP, kept current                              | read  | A well known security group explains SSRF defences.                      |
| Server side request forgery (guide)                        | PortSwigger Web Security Academy, kept current   | read  | A security firm that makes the leading web testing tool, with free labs. |
| Migrate from the v1 SDK (guide)                            | The MCP project, docs                            | read  | The official upgrade path for step five.                                 |
| Building agents with the Model Context Protocol (workshop) | Mahesh Murag, Anthropic, AI Engineer, 2025       | video | Shows wrapping an API as tools. Check the title.                         |

## 06 Route tool calls through agentgateway

| Pick                                         | Author, year                                  | Kind  | Why it passes                                                  |
| -------------------------------------------- | --------------------------------------------- | ----- | -------------------------------------------------------------- |
| agentgateway docs                            | The agentgateway project, kept current        | read  | The official docs from the team that builds the gateway.       |
| agentgateway MCP guide                       | The agentgateway project, docs                | read  | The official page for the MCP features the step uses.          |
| Authorization (specification page)           | The MCP project, spec                         | read  | Explains what a gateway must check before it forwards a call.  |
| Security best practices (specification page) | The MCP project, spec                         | read  | Names token passthrough, which a gateway must not do.          |
| Introducing advanced tool use                | Anthropic engineering, 2025                   | read  | The cost of many tools, which a gateway allow list reduces.    |
| Envoy proxy architecture overview            | Envoy project, docs                           | read  | The proxy design that many gateways follow, from its makers.   |
| The lethal trifecta for AI agents            | Simon Willison, 2025                          | read  | Why a gateway is a good place to cut a leg.                    |
| MCP tool poisoning notification              | Invariant Labs, 2025                          | read  | Why a gateway should pin and filter tool definitions.          |
| Agentgateway intro talk (video)              | Solo.io or the agentgateway maintainers, 2025 | video | A talk by the makers. Find the exact title and check it first. |
