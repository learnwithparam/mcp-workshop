// Serve the Harrow Lane MCP server over Streamable HTTP, for signed-in staff only.
// Start it with: bun http.ts   (it listens on http://127.0.0.1:8787/mcp)
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
import { decodeJwt } from "jose";
import { ISSUER, RESOURCE } from "../../../clinic-login";
import { createServer } from "./server";

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

// Turns a token into what the server knows about the caller. A bad token becomes a 401.
async function verifyAccessToken(token: string): Promise<AuthInfo> {
  try {
    // Mistake: decodeJwt only reads the token. It never checks the signature,
    // so anyone can write a token that says "I am the clinical director".
    const claims = decodeJwt(token) as {
      sub: string;
      scope: string;
      exp: number;
      role: string;
      site: string;
    };
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

// Reads the Bearer token from the Authorization header, and only from there.
const checkBearerToken = requireBearerAuth({
  verifier: { verifyAccessToken },
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl).toString(),
});

const mcpHandler = createMcpHandler(() => createServer());

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
  return mcpHandler.fetch(request, { authInfo: auth });
}

Bun.serve({ hostname: "127.0.0.1", port, fetch: handleRequest });
console.error(`harrow-lane server listening on http://127.0.0.1:${port}/mcp`);
