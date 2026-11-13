// check-the-audience: only a token made for this server works, an expired one does not, and the
// caller's token never travels on to the PIMS (no token passthrough).
import {
  connectClient,
  rawCall,
  tokenFor,
  toolNames,
  withHttpServer,
} from "../parts/03-open-the-server-safely/http-check-kit";
import { failed, rule, scenario } from "./lib/rules";
import type { World } from "./lib/world";

const LAB_RESULTS_SERVER = "https://lab-results.harrowlane.test";

// Ola looks Biscuit up and checks the diary, as she would at the front desk.
async function frontDeskCalls(url: string, token: string) {
  const client = await connectClient(url, { token });
  try {
    await client.callTool({ name: "find_patient", arguments: { name: "Biscuit" } });
    await client.callTool({ name: "find_free_slots", arguments: { site: "millbrook" } });
  } finally {
    await client.close();
  }
}

// The signature is the last part of a token. Any trace of it in the world log means the token
// went on to the PIMS.
function tokenReachedThePims(world: World, token: string): boolean {
  const signature = token.split(".").at(-1) ?? token;
  const loggedCalls = JSON.stringify(world.calls());
  return loggedCalls.includes(signature);
}

const run = scenario(async (dir) =>
  withHttpServer(dir, async ({ url, world }) => {
    const olaToken = await tokenFor("ola", url);
    const ownToken = await rawCall(url, { method: "tools/list", token: olaToken });
    const labToken = await tokenFor("ola", url, { audience: LAB_RESULTS_SERVER });
    const otherAudience = await rawCall(url, { method: "tools/list", token: labToken });
    const oldToken = await tokenFor("ola", url, { expiresIn: "5 minutes ago" });
    const expired = await rawCall(url, { method: "tools/list", token: oldToken });
    await frontDeskCalls(url, olaToken);
    const passedOn = tokenReachedThePims(world, olaToken);
    const pimsWasCalled = world.calls().some((loggedCall) => loggedCall.fn === "findPatients");
    return { ownToken, otherAudience, expired, passedOn, pimsWasCalled };
  }),
);

let lastError = "";
const ok = async (dir: string) => {
  const outcome = await run(dir);
  return failed(outcome) ? undefined : outcome;
};

export default [
  rule(
    "bun http.ts starts and Ola's token for this server still lists the tools",
    async (dir) => {
      const outcome = await run(dir);
      lastError = failed(outcome) ? outcome.failed : "";
      if (failed(outcome)) return false;
      const ownToken = outcome.ownToken;
      return ownToken.status === 200 && toolNames(ownToken.body.result).includes("find_patient");
    },
    () =>
      "compare the audience with RESOURCE from clinic-login, the URL this server serves. " +
      `The checker saw: ${lastError || "a refusal of a good token"}`,
  ),
  rule(
    "A token made for the lab-results server gets 401",
    async (dir) => (await ok(dir))?.otherAudience.status === 401,
    "claims.aud names the server a token was made for. Throw in verifyAccessToken when " +
      "[claims.aud].flat() does not include RESOURCE",
  ),
  rule(
    "An expired token gets 401",
    async (dir) => (await ok(dir))?.expired.status === 401,
    "check every token with readToken from clinic-login; it refuses an expired one",
  ),
  rule(
    "The caller's token never reaches the PIMS",
    async (dir) => {
      const outcome = await ok(dir);
      return Boolean(outcome?.pimsWasCalled && !outcome.passedOn);
    },
    "never send the caller's token on. The token was made for this server only. " +
      "Tell the PIMS who is asking with the staff id, if it must know",
  ),
];
