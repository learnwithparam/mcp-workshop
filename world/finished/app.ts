// The finished server's HTTP front: Host check, protected resource metadata, token check, then MCP.
import { OAuthError, OAuthErrorCode, createMcpHandler, getOAuthProtectedResourceMetadataUrl, hostHeaderValidationResponse, localhostAllowedHostnames, oauthMetadataResponse, requireBearerAuth, type AuthInfo } from "@modelcontextprotocol/server";
import { ISSUER, RESOURCE, readToken } from "../auth";
import { callerFrom, createServer } from "./server";

const resourceUrl = new URL(RESOURCE);
const oauthMetadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["diary:read", "diary:write", "notes:read", "drugs:read"],
};

async function verifyAccessToken(token: string): Promise<AuthInfo> {
  try {
    const t = await readToken(token);
    const aud = [t.aud].flat().find((a) => URL.canParse(a) && new URL(a).origin === resourceUrl.origin);
    return { token, clientId: t.sub, scopes: t.scope.split(" "), expiresAt: t.exp, resource: aud ? new URL(aud) : undefined, extra: { role: t.role, site: t.site } };
  } catch (e) {
    throw new OAuthError(OAuthErrorCode.InvalidToken, `token rejected: ${(e as Error).message}`);
  }
}

const gate = requireBearerAuth({ verifier: { verifyAccessToken }, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl).toString(), expectedResource: resourceUrl });
const handler = createMcpHandler(({ authInfo }) => createServer(callerFrom(authInfo)));

export const app = {
  async fetch(request: Request): Promise<Response> {
    const badHost = hostHeaderValidationResponse(request, localhostAllowedHostnames());
    if (badHost) return badHost;
    const meta = oauthMetadataResponse(request, { oauthMetadata, resourceServerUrl: resourceUrl });
    if (meta) return meta;
    if (new URL(request.url).pathname !== "/mcp") return new Response("Not found", { status: 404 });
    const auth = await gate(request);
    if (auth instanceof Response) return auth;
    return handler.fetch(request, { authInfo: auth });
  },
};
