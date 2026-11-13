// The Harrow Lane server's HTTP front, as it was at the end of Part 3. It checks the Host header,
// serves the protected resource metadata, checks the access token, then hands the request to MCP.
// The tools come from the finished server, so this step is only about the deploy.
//
// TODO: this front only works on your laptop. Its address is fixed to http://127.0.0.1:8787/mcp.
// On a host such as Fly.io or Render, the public address and the port come from settings.
// Read PUBLIC_URL here, and use it for the resource, the Host check and the token audience.
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
import { ISSUER, RESOURCE, readToken } from "../../../../world/auth";
import { callerFrom, createServer } from "../../../../world/finished/server";

export const publicUrl = new URL(RESOURCE);
const allowedHostnames = localhostAllowedHostnames();

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
