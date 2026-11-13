// limit-by-role: each token sees only the tools its scopes allow, a missing scope gets a 403 that
// names it, and a vet reads clinical notes only for patients of their own site.
import {
  rawCall,
  textOf,
  tokenFor,
  toolNames,
  withHttpServer,
} from "../parts/03-open-the-server-safely/http-check-kit";
import { failed, rule, scenario } from "./lib/rules";
import type { World } from "./lib/world";

const BISCUIT = "P-0001"; // a Millbrook patient
const BEAR = "P-0002"; // a Harrow Lane patient

function callTool(url: string, token: string, name: string, args: Record<string, unknown>) {
  return rawCall(url, { method: "tools/call", token, params: { name, arguments: args } });
}

function notesWereRead(world: World, patientId: string): boolean {
  return world
    .calls()
    .some(
      (loggedCall) => loggedCall.fn === "clinicalNotes" && loggedCall.args.patientId === patientId,
    );
}

const run = scenario(async (dir) =>
  withHttpServer(dir, async ({ url, world }) => {
    const ola = await tokenFor("ola", url);
    const sam = await tokenFor("sam", url);
    const joon = await tokenFor("joon", url);
    const olaTools = await rawCall(url, { method: "tools/list", token: ola });
    const olaNotes = await callTool(url, ola, "read_notes", { patientId: BISCUIT });
    const olaReadNotes = notesWereRead(world, BISCUIT);
    const samOwnSite = await callTool(url, sam, "read_notes", { patientId: BISCUIT });
    const samOtherSite = await callTool(url, sam, "read_notes", { patientId: BEAR });
    const samReadBear = notesWereRead(world, BEAR);
    const samDrugs = await callTool(url, sam, "controlled_drugs_log", {});
    const joonDrugs = await callTool(url, joon, "controlled_drugs_log", {});
    return {
      olaTools,
      olaNotes,
      olaReadNotes,
      samOwnSite,
      samOtherSite,
      samReadBear,
      samDrugs,
      joonDrugs,
    };
  }),
);

let lastError = "";
const ok = async (dir: string) => {
  const outcome = await run(dir);
  return failed(outcome) ? undefined : outcome;
};

function namesScope(challenge: string | null, scope: string): boolean {
  return Boolean(challenge?.includes("insufficient_scope") && challenge.includes(scope));
}

export default [
  rule(
    "Ola's tools/list has the diary tools but no read_notes and no controlled_drugs_log",
    async (dir) => {
      const outcome = await run(dir);
      lastError = failed(outcome) ? outcome.failed : "";
      if (failed(outcome)) return false;
      const names = toolNames(outcome.olaTools.body.result);
      const hidden = !names.includes("read_notes") && !names.includes("controlled_drugs_log");
      return names.includes("find_free_slots") && hidden;
    },
    () =>
      "in createServer(caller), register a tool only when caller.scopes includes " +
      `TOOL_SCOPES[name], and build each server with callerFrom(authInfo). ${lastError}`,
  ),
  rule(
    'Ola\'s direct call to read_notes gets 403 with scope="notes:read", and no notes are read',
    async (dir) => {
      const outcome = await ok(dir);
      const challenge = outcome?.olaNotes.headers.get("www-authenticate") ?? null;
      const refused = outcome?.olaNotes.status === 403 && namesScope(challenge, "notes:read");
      return Boolean(refused && !outcome?.olaReadNotes);
    },
    "in http.ts, read the Mcp-Name header of a tools/call; when the token lacks its scope, " +
      "return bearerAuthChallengeResponse with OAuthErrorCode.InsufficientScope and requiredScopes",
  ),
  rule(
    "Dr Reyes reads the notes of Biscuit, a Millbrook patient",
    async (dir) => {
      const answer = (await ok(dir))?.samOwnSite;
      const result = answer?.body.result;
      return answer?.status === 200 && !result?.isError && /\d{4}-\d{2}-\d{2}/.test(textOf(result));
    },
    "a vet's token has notes:read, so read_notes stays registered for Dr Reyes",
  ),
  rule(
    "Dr Reyes cannot read the notes of Bear, a Harrow Lane patient",
    async (dir) => {
      const outcome = await ok(dir);
      const refused = outcome?.samOtherSite.body.result?.isError === true;
      return Boolean(refused && !outcome?.samReadBear);
    },
    "in readNotes, compare patient.homeSite with caller.site before you read any note; " +
      "return a tool error unless they match or the caller is the director",
  ),
  rule(
    "Dr Reyes gets 403 on controlled_drugs_log, and Joon the director reads it",
    async (dir) => {
      const outcome = await ok(dir);
      const challenge = outcome?.samDrugs.headers.get("www-authenticate") ?? null;
      const samRefused = outcome?.samDrugs.status === 403 && namesScope(challenge, "drugs:read");
      const joonText = textOf(outcome?.joonDrugs.body.result);
      return Boolean(samRefused && joonText.includes("balance"));
    },
    "controlled_drugs_log needs drugs:read, which only the director's token has",
  ),
];
