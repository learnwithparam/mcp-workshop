// Serve the Harrow Lane MCP server over Streamable HTTP, for signed-in staff only.
// It accepts only tokens made for this server, and it never passes a token on.
// Start it with: bun http.ts   (it listens on http://127.0.0.1:8787/mcp)
import {
  type AuthInfo,
  bearerAuthChallengeResponse,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  OAuthError,
  OAuthErrorCode,
  oauthMetadataResponse,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { ISSUER, RESOURCE, readToken } from "../../../clinic-login";
import { callerFrom, createServer, TOOL_SCOPES } from "./server";

// The check picks a free port and passes it in MCP_PORT.
const port = Number(process.env.MCP_PORT ?? 8787);
const resourceUrl = new URL(RESOURCE);

// What the clinic's authorization server offers. A client reads this to learn where to sign in.
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

// A token names the server it was made for in its "aud" (audience) claim.
// A token made for another server, such as the lab-results server, must not work here.
function isForThisServer(audience: string | string[]): boolean {
  const audiences = [audience].flat();
  return audiences.includes(RESOURCE);
}

// Turns a token into what the server knows about the caller. A bad token becomes a 401.
async function verifyAccessToken(token: string): Promise<AuthInfo> {
  try {
    const claims = await readToken(token);
    if (!isForThisServer(claims.aud)) {
      throw new Error(`the token is for ${claims.aud}, not for ${RESOURCE}`);
    }
    return {
      token,
      clientId: claims.sub,
      scopes: claims.scope.split(" "),
      expiresAt: claims.exp,
      extra: { role: claims.role, site: claims.site },
    };
  } catch (error) {
    const reason = (error as Error).message;
    throw new OAuthError(OAuthErrorCode.InvalidToken, `token rejected: ${reason}`);
  }
}

const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceUrl).toString();

// Reads the Bearer token from the Authorization header, and only from there.
const checkBearerToken = requireBearerAuth({
  verifier: { verifyAccessToken },
  resourceMetadataUrl,
});

// Each request gets a server built for this caller: only the tools their scopes allow.
const mcpHandler = createMcpHandler(({ authInfo }) => createServer(callerFrom(authInfo)));

// A tools/call names its tool in the Mcp-Name header. When the token lacks the scope for it,
// answer 403 and name the scope, so the client can ask the person to sign in with more access.
function missingScopeResponse(request: Request, auth: AuthInfo): Response | undefined {
  const isToolCall = request.headers.get("mcp-method") === "tools/call";
  const neededScope = TOOL_SCOPES[request.headers.get("mcp-name") ?? ""];
  if (!isToolCall || !neededScope || auth.scopes.includes(neededScope)) {
    return undefined;
  }
  const error = new OAuthError(OAuthErrorCode.InsufficientScope, `this tool needs ${neededScope}`);
  return bearerAuthChallengeResponse(error, { requiredScopes: [neededScope], resourceMetadataUrl });
}

async function handleRequest(request: Request): Promise<Response> {
  const badHost = hostHeaderValidationResponse(request, localhostAllowedHostnames());
  if (badHost) {
    return badHost;
  }
  // The protected resource metadata is public: a client reads it before it has a token.
  const metadata = oauthMetadataResponse(request, {
    oauthMetadata,
    resourceServerUrl: resourceUrl,
  });
  if (metadata) {
    return metadata;
  }
  const path = new URL(request.url).pathname;
  if (path !== "/mcp") {
    return new Response("Not found", { status: 404 });
  }
  const auth = await checkBearerToken(request);
  // No token, or a bad one: the answer is a 401 that says where the metadata is.
  if (auth instanceof Response) {
    return auth;
  }
  const missingScope = missingScopeResponse(request, auth);
  if (missingScope) {
    return missingScope;
  }
  return mcpHandler.fetch(request, { authInfo: auth });
}

Bun.serve({ hostname: "127.0.0.1", port, fetch: handleRequest });
console.error(`harrow-lane server listening on http://127.0.0.1:${port}/mcp`);
