# Parts

This file is made from the folders in `parts/` and the minutes in each step's `step.toml`. Run `bun run parts` after you add or change a step. `bun run check` fails when this file is out of date.

## Parts

| Part                                                                                              | Folder                                  | Steps | Minutes |
| ------------------------------------------------------------------------------------------------- | --------------------------------------- | ----: | ------: |
| [Start here](parts/00-start-here/README.md)                                                       | `start-here`                            |     1 |      15 |
| [Give the diary to the model](parts/01-give-the-diary/README.md)                                  | `give-the-diary`                        |     4 |      50 |
| [Pick the right tool](parts/02-pick-the-right-tool/README.md)                                     | `pick-the-right-tool`                   |     6 |      65 |
| [Open the server safely](parts/03-open-the-server-safely/README.md)                               | `open-the-server-safely`                |     6 |      70 |
| [Defend and ship](parts/04-defend-and-ship/README.md)                                             | `defend-and-ship`                       |     6 |      90 |
| [Grow the server](parts/05-grow-the-server/README.md)                                             | `grow-the-server`                       |     7 |     145 |
| [Route tool calls through agentgateway](parts/06-route-tool-calls-through-agentgateway/README.md) | `route-tool-calls-through-agentgateway` |     1 |      25 |
| **Total**                                                                                         |                                         |    31 |     460 |

## Steps

| Part                                    | Step                                                                                                                                     | Minutes | Files to edit                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------: | ------------------------------------------------- |
| `start-here`                            | [`meet-the-clinic`](parts/00-start-here/01-meet-the-clinic/problem/README.md)                                                            |      15 | `answers.md`                                      |
| `give-the-diary`                        | [`expose-the-diary`](parts/01-give-the-diary/01-expose-the-diary/problem/README.md)                                                      |      15 | `server.ts`                                       |
| `give-the-diary`                        | [`book-an-appointment`](parts/01-give-the-diary/02-book-an-appointment/problem/README.md)                                                |      15 | `server.ts`                                       |
| `give-the-diary`                        | [`return-errors-the-model-can-fix`](parts/01-give-the-diary/03-return-errors-the-model-can-fix/problem/README.md)                        |      10 | `server.ts`                                       |
| `give-the-diary`                        | [`connect-claude`](parts/01-give-the-diary/04-connect-claude/problem/README.md)                                                          |      10 | `notes/`, `server.ts`                             |
| `pick-the-right-tool`                   | [`eval-tool-choice`](parts/02-pick-the-right-tool/01-eval-tool-choice/problem/README.md)                                                 |      15 | `evals/`                                          |
| `pick-the-right-tool`                   | [`shape-tools-around-jobs`](parts/02-pick-the-right-tool/02-shape-tools-around-jobs/problem/README.md)                                   |      15 | `server.ts`                                       |
| `pick-the-right-tool`                   | [`return-structured-results`](parts/02-pick-the-right-tool/03-return-structured-results/problem/README.md)                               |      10 | `server.ts`                                       |
| `pick-the-right-tool`                   | [`mark-risky-tools`](parts/02-pick-the-right-tool/04-mark-risky-tools/problem/README.md)                                                 |       5 | `server.ts`                                       |
| `pick-the-right-tool`                   | [`add-records-as-resources`](parts/02-pick-the-right-tool/05-add-records-as-resources/problem/README.md)                                 |      10 | `server.ts`                                       |
| `pick-the-right-tool`                   | [`test-the-server`](parts/02-pick-the-right-tool/06-test-the-server/problem/README.md)                                                   |      10 | `server.ts`, `test/`                              |
| `open-the-server-safely`                | [`serve-over-http`](parts/03-open-the-server-safely/01-serve-over-http/problem/README.md)                                                |      15 | `booking-rules.ts`, `http.ts`, `server.ts`        |
| `open-the-server-safely`                | [`pass-conformance`](parts/03-open-the-server-safely/02-pass-conformance/problem/README.md)                                              |      10 | `booking-rules.ts`, `http.ts`, `server.ts`        |
| `open-the-server-safely`                | [`require-a-token`](parts/03-open-the-server-safely/03-require-a-token/problem/README.md)                                                |      15 | `booking-rules.ts`, `http.ts`, `server.ts`        |
| `open-the-server-safely`                | [`check-the-audience`](parts/03-open-the-server-safely/04-check-the-audience/problem/README.md)                                          |      10 | `booking-rules.ts`, `http.ts`, `server.ts`        |
| `open-the-server-safely`                | [`limit-by-role`](parts/03-open-the-server-safely/05-limit-by-role/problem/README.md)                                                    |      10 | `booking-rules.ts`, `http.ts`, `server.ts`        |
| `open-the-server-safely`                | [`confirm-before-cancel`](parts/03-open-the-server-safely/06-confirm-before-cancel/problem/README.md)                                    |      10 | `booking-rules.ts`, `http.ts`, `server.ts`        |
| `defend-and-ship`                       | [`pin-third-party-tools`](parts/04-defend-and-ship/01-pin-third-party-tools/problem/README.md)                                           |      15 | `pins.ts`                                         |
| `defend-and-ship`                       | [`break-the-lethal-trifecta`](parts/04-defend-and-ship/02-break-the-lethal-trifecta/problem/README.md)                                   |      15 | `notes/`, `outbox.jsonl`, `server.ts`             |
| `defend-and-ship`                       | [`deploy-the-server`](parts/04-defend-and-ship/03-deploy-the-server/problem/README.md)                                                   |      15 | `app.ts`, `serve.ts`                              |
| `defend-and-ship`                       | [`limit-requests`](parts/04-defend-and-ship/04-limit-requests/problem/README.md)                                                         |      15 | `app.ts`, `serve.ts`                              |
| `defend-and-ship`                       | [`trace-every-tool-call`](parts/04-defend-and-ship/05-trace-every-tool-call/problem/README.md)                                           |      20 | `app.ts`, `serve.ts`                              |
| `defend-and-ship`                       | [`write-the-handover`](parts/04-defend-and-ship/06-write-the-handover/problem/README.md)                                                 |      10 | `HANDOVER.md`, `evals/`                           |
| `grow-the-server`                       | [`build-a-small-client`](parts/05-grow-the-server/01-build-a-small-client/problem/README.md)                                             |      20 | `client.ts`                                       |
| `grow-the-server`                       | [`report-lab-results-later`](parts/05-grow-the-server/02-report-lab-results-later/problem/README.md)                                     |      20 | `server.ts`                                       |
| `grow-the-server`                       | [`front-two-servers`](parts/05-grow-the-server/03-front-two-servers/problem/README.md)                                                   |      25 | `pins.json`, `pins.ts`, `proxy.ts`, `upstream.ts` |
| `grow-the-server`                       | [`publish-to-the-registry`](parts/05-grow-the-server/04-publish-to-the-registry/problem/README.md)                                       |      15 | `server.json`                                     |
| `grow-the-server`                       | [`upgrade-a-v1-server`](parts/05-grow-the-server/05-upgrade-a-v1-server/problem/README.md)                                               |      15 | `server.ts`                                       |
| `grow-the-server`                       | [`wrap-your-own-api`](parts/05-grow-the-server/06-wrap-your-own-api/problem/README.md)                                                   |      30 | `EVIDENCE.md`, `my-api.json`, `server.ts`         |
| `grow-the-server`                       | [`secure-the-client`](parts/05-grow-the-server/07-secure-the-client/problem/README.md)                                                   |      20 | `guards.ts`                                       |
| `route-tool-calls-through-agentgateway` | [`put-servers-behind-agentgateway`](parts/06-route-tool-calls-through-agentgateway/01-put-servers-behind-agentgateway/problem/README.md) |      25 | none                                              |
