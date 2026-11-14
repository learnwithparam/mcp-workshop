// The Harrow Lane server's HTTP front, as deployed. It checks the Host header, serves the
// protected resource metadata, checks the access token, then hands the request to MCP.
// The tools come from the finished server, so this step is only about the deploy.
//
// PUBLIC_URL is the address people use to reach the server, for example
// https://harrow-lane.fly.dev/mcp. Tokens must be minted for exactly this address.
import {
  type AuthInfo,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  OAuthError,
  OAuthErrorCode,
  oauthMetadataResponse,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { ISSUER, readToken } from "../../../../world/auth";
import { callerFrom, createServer } from "../../../../world/finished/server";

export const publicUrl = new URL(process.env.PUBLIC_URL ?? "http://127.0.0.1:8787/mcp");
// Requests may name the public host, or localhost while you test on your own machine.
const allowedHostnames = [...localhostAllowedHostnames(), publicUrl.hostname];

// biome-ignore-start lint/style/useNamingConvention: OAuth metadata field names are fixed
const oauthMetadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["diary:read", "diary:write", "notes:read", "drugs:read"],
};
// biome-ignore-end lint/style/useNamingConvention: the OAuth field names end here

// A token can name several audiences. We keep the one that is exactly this server's URL.
function audienceForThisServer(audience: string | string[]): URL | undefined {
  const audiences = [audience].flat();
  const ours = audiences.find((candidate) => candidate === publicUrl.href);
  return ours ? new URL(ours) : undefined;
}

async function verifyAccessToken(token: string): Promise<AuthInfo> {
  try {
    const claims = await readToken(token);
    return {
      token,
      clientId: claims.sub,
      scopes: claims.scope.split(" "),
      expiresAt: claims.exp,
      resource: audienceForThisServer(claims.aud),
      extra: { role: claims.role, site: claims.site },
    };
  } catch (error) {
    const reason = (error as Error).message;
    throw new OAuthError(OAuthErrorCode.InvalidToken, `token rejected: ${reason}`);
  }
}

const checkBearerToken = requireBearerAuth({
  verifier: { verifyAccessToken },
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(publicUrl),
  expectedResource: publicUrl,
});
const mcpHandler = createMcpHandler(({ authInfo }) => createServer(callerFrom(authInfo)));

// TODO: record one trace span for every tools/call, and send it to the collector. See the README.

export const app = {
  async fetch(request: Request): Promise<Response> {
    const badHost = hostHeaderValidationResponse(request, allowedHostnames);
    if (badHost) return badHost;
    const metadata = oauthMetadataResponse(request, {
      oauthMetadata,
      resourceServerUrl: publicUrl,
    });
    if (metadata) return metadata;
    const path = new URL(request.url).pathname;
    if (path !== publicUrl.pathname) return new Response("Not found", { status: 404 });
    const auth = await checkBearerToken(request);
    if (auth instanceof Response) return auth;
    return mcpHandler.fetch(request, { authInfo: auth });
  },
};
