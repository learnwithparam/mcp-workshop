# Parts

Every part of the course, its folder, its steps in order, their minutes, and what each step's check reads. A part
session starts from this file and the part's README. Parts 00 and 01 are built. Parts 02 to 05 are skeletons: their
README has the problem, the cited reason, a diagram and the step table, and their Walkthrough is `TODO(part session)`.

Conventions every part keeps (see Part 01 for the working pattern):

- A step lives in `parts/NN-<part>/NN-<step-name>/` with `step.toml`, `problem/` (README and the starter),
  `solution/`, at least one `wrong/<mistake>/`, and `checks/<step-name>.ts`. Each starter is the previous step's
  solution plus a `TODO`.
- Checks start the learner's server as an MCP client and never import it: stdio through `checks/lib/mcp.ts`
  (`withServer`, which spawns `launch.json` or `bun server.ts`), HTTP through the same client with a token from
  `world/auth.ts`. Each run gets a fresh copy of the diary from `checks/lib/world.ts`, and checks read the diary
  rows and the world log (`world.calls()`), never the model's reply.
- Behaviour that depends on a model is judged with `threeRuns` from `checks/lib/rules.ts`: three fresh runs in
  replay mode, all must pass. Recorded turns live in `world/replays/`; models come from `config/models.ts` by role.
- The finished server (`world/finished/`) already does every step through Part 04. Use it as the reference answer.

| Part folder                 | Step                              | Min | What the step's check reads                                                                                                             |
| --------------------------- | --------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `00-start-here`             | `meet-the-clinic`                 | 15  | `answers.md` against a fresh diary: free-slot count, Dr Reyes's first slot, Ola refused                                                 |
| `01-give-the-diary`         | `expose-the-diary`                | 15  | `tools/list`, a live `find_free_slots` call, stdout before any request, a slot booked behind the server's back                          |
|                             | `book-an-appointment`             | 15  | diary rows after a good booking, a cancelled slot, an exact clash, an overlap, bad input                                                |
|                             | `return-errors-the-model-can-fix` | 10  | five planted bad calls: error text phrases, listed free slots against the diary, no rows written                                        |
|                             | `connect-claude`                  | 10  | `.mcp.json` launched as written, its tools, every time in the pasted answer against the diary                                           |
| `02-pick-the-right-tool`    | `eval-tool-choice`                | 15  | `evals/baseline.json` from the shipped 20-task eval against a shipped 14-tool server                                                    |
|                             | `shape-tools-around-jobs`         | 15  | `tools/list` rules (at most 6 tools, names, descriptions, stable order); eval at least 18 of 20 and 4 above baseline over 3 replay runs |
|                             | `return-structured-results`       | 10  | `structuredContent` against `outputSchema` on 10 fixture calls; concise answer under 150 tokens                                         |
|                             | `mark-risky-tools`                | 5   | tool annotations against the step's table                                                                                               |
|                             | `add-records-as-resources`        | 10  | `resources/templates/list`, `resources/read` on a fixture id, `-32602` on an unknown id                                                 |
|                             | `test-the-server`                 | 10  | `bun test` passes, then fails against a mutated server without the clash check                                                          |
| `03-open-the-server-safely` | `serve-over-http`                 | 15  | stateless `tools/list` over HTTP, 403 on a bad Host, a legacy-era client still served                                                   |
|                             | `pass-conformance`                | 10  | `@modelcontextprotocol/conformance` exit code with a shipped expected-failures file                                                     |
|                             | `require-a-token`                 | 15  | 401 and `WWW-Authenticate` with the metadata URL, the metadata JSON, query-string token refused                                         |
|                             | `check-the-audience`              | 10  | wrong-audience and expired tokens get 401; world log shows no inbound token passed on                                                   |
|                             | `limit-by-role`                   | 10  | Ola: no notes tool and 403 on a direct call; Dr Reyes: own site only; Joon only for the drugs log                                       |
|                             | `confirm-before-cancel`           | 10  | diary row after the first call, a no, a yes, and a tampered `requestState`                                                              |
| `04-defend-and-ship`        | `pin-third-party-tools`           | 15  | pin check against a clean and two poisoned versions of a shipped insurance server                                                       |
|                             | `break-the-lethal-trifecta`       | 15  | Pepper's planted note through the recorded agent, 3 runs; no contact detail in outbound arguments                                       |
|                             | `deploy-the-server`               | 15  | the Part 03 checks against `--url <deployed URL>`                                                                                       |
|                             | `write-the-handover`              | 10  | `HANDOVER.md` sections, scores matched to the eval JSON, every tool named                                                               |
| `05-grow-the-server`        | `build-a-small-client`            | 20  | the client's output against the learner's server and a shipped legacy server                                                            |
|                             | `report-lab-results-later`        | 20  | task states from working to completed; cancel                                                                                           |
|                             | `front-two-servers`               | 25  | tools through the proxy, upstream token audiences in upstream logs, unpinned tool dropped                                               |
|                             | `publish-to-the-registry`         | 15  | `server.json` against the registry schema                                                                                               |
|                             | `upgrade-a-v1-server`             | 15  | Part 01 checks on the upgraded server; no `@mcp-codemod-error` left                                                                     |

Totals: start-here 15, give-the-diary 50, pick-the-right-tool 65, open-the-server-safely 70, defend-and-ship 55,
grow-the-server 95. Core 255, with the extension 350. `schedules.toml` maps these onto formats.

Versions to pin when a part is built, read from npm on the build date of the spine: `@modelcontextprotocol/server`
and `client` 2.4.0, `@modelcontextprotocol/conformance` 0.1.16 (latest) or 0.2.0-alpha.12 (the alpha tag, which
carries the newer spec scenarios), `@modelcontextprotocol/ext-tasks` 0.2.3, `@modelcontextprotocol/codemod` 2.4.0,
`wrangler` 4.161.0. Re-read each from the registry when a part is built.
