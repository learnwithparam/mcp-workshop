// The finished server's HTTP front. It checks the Host header, serves the protected resource
// metadata, checks the access token, and then hands the request to MCP.
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
import { ISSUER, RESOURCE, readToken } from "../auth";
import { callerFrom, createServer } from "./server";

const resourceUrl = new URL(RESOURCE);
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

// A token can name several audiences; we keep the one that points at this server.
function audienceForThisServer(audience: string | string[]): URL | undefined {
  const audiences = [audience].flat();
  const ours = audiences.find(
    (candidate) => URL.canParse(candidate) && new URL(candidate).origin === resourceUrl.origin,
  );
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
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl).toString(),
  expectedResource: resourceUrl,
});
const mcpHandler = createMcpHandler(({ authInfo }) => createServer(callerFrom(authInfo)));

export const app = {
  async fetch(request: Request): Promise<Response> {
    const badHost = hostHeaderValidationResponse(request, localhostAllowedHostnames());
    if (badHost) return badHost;
    const metadata = oauthMetadataResponse(request, {
      oauthMetadata,
      resourceServerUrl: resourceUrl,
    });
    if (metadata) return metadata;
    const path = new URL(request.url).pathname;
    if (path !== "/mcp") return new Response("Not found", { status: 404 });
    const auth = await checkBearerToken(request);
    if (auth instanceof Response) return auth;
    return mcpHandler.fetch(request, { authInfo: auth });
  },
};
