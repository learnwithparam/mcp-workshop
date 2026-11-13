// require-a-token: no token gets a 401 that points to the protected resource metadata, the
// metadata names the clinic's authorization server, and only a real token in the header works.
import { SignJWT } from "jose";
import {
  rawCall,
  STAFF,
  tokenFor,
  toolNames,
  withHttpServer,
} from "../parts/03-open-the-server-safely/http-check-kit";
import { ISSUER } from "../world/auth";
import { failed, rule, scenario } from "./lib/rules";

// A token that looks right but is signed with a key the clinic never had.
function forgedToken(url: string) {
  const otherKey = new TextEncoder().encode("not-the-clinic-key-anyone-can-make-this-0001");
  const ola = STAFF.ola;
  return new SignJWT({ scope: "diary:read diary:write", role: ola.role, site: ola.site })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(ola.staffId)
    .setAudience(url)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(otherKey);
}

function metadataUrlFor(url: string) {
  return `${new URL(url).origin}/.well-known/oauth-protected-resource/mcp`;
}

async function readMetadata(url: string) {
  const response = await fetch(metadataUrlFor(url));
  if (response.status !== 200) return {};
  return (await response.json()) as { resource?: string; authorization_servers?: string[] };
}

const run = scenario(async (dir) =>
  withHttpServer(dir, async ({ url }) => {
    const olaToken = await tokenFor("ola", url);
    const noToken = await rawCall(url, { method: "tools/list" });
    const metadata = await readMetadata(url);
    const withToken = await rawCall(url, { method: "tools/list", token: olaToken });
    const queryToken = await rawCall(url, {
      method: "tools/list",
      query: `access_token=${olaToken}`,
    });
    const forged = await rawCall(url, { method: "tools/list", token: await forgedToken(url) });
    return { url, noToken, metadata, withToken, queryToken, forged };
  }),
);

let lastError = "";
const ok = async (dir: string) => {
  const outcome = await run(dir);
  return failed(outcome) ? undefined : outcome;
};

export default [
  rule(
    "bun http.ts starts and answers on the port in MCP_PORT",
    async (dir) => {
      const outcome = await run(dir);
      lastError = failed(outcome) ? outcome.failed : "";
      return !failed(outcome);
    },
    () => `run "bun http.ts" in the problem folder and fix what it prints. Saw: ${lastError}`,
  ),
  rule(
    "A request with no token gets 401 and a WWW-Authenticate header that names the metadata URL",
    async (dir) => {
      const outcome = await ok(dir);
      const challenge = outcome?.noToken.headers.get("www-authenticate") ?? "";
      const namesMetadata = challenge.includes(
        `resource_metadata="${metadataUrlFor(outcome?.url ?? "")}"`,
      );
      return outcome?.noToken.status === 401 && namesMetadata;
    },
    "put requireBearerAuth({ verifier, resourceMetadataUrl }) in front of the handler; " +
      "getOAuthProtectedResourceMetadataUrl(new URL(RESOURCE)) gives the URL",
  ),
  rule(
    "The protected resource metadata names this server and the clinic's authorization server",
    async (dir) => {
      const metadata = (await ok(dir))?.metadata;
      const url = (await ok(dir))?.url;
      return (
        metadata?.resource === url && Boolean(metadata?.authorization_servers?.includes(ISSUER))
      );
    },
    "answer the metadata request first: oauthMetadataResponse(request, { oauthMetadata, " +
      "resourceServerUrl: new URL(RESOURCE) }), with ISSUER as the oauthMetadata issuer",
  ),
  rule(
    "Ola's real token in the Authorization header lists the tools",
    async (dir) => {
      const withToken = (await ok(dir))?.withToken;
      return withToken?.status === 200 && toolNames(withToken.body.result).includes("find_patient");
    },
    "verifyAccessToken returns an AuthInfo built from readToken(token); pass it on with " +
      "mcpHandler.fetch(request, { authInfo })",
  ),
  rule(
    "A token in the URL query string is refused with 401",
    async (dir) => (await ok(dir))?.queryToken.status === 401,
    "read the token only from the Authorization header. A URL ends up in logs and in " +
      "browser history, so the spec forbids tokens there",
  ),
  rule(
    "A token signed with another key is refused with 401",
    async (dir) => (await ok(dir))?.forged.status === 401,
    "check the signature: readToken(token) from clinic-login does it. " +
      "Decoding a token without checking it lets anyone write their own",
  ),
];
