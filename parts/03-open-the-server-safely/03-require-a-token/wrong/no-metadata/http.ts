// Serve the Harrow Lane MCP server over Streamable HTTP, for signed-in staff only.
// Start it with: bun http.ts   (it listens on http://127.0.0.1:8787/mcp)
import {
  type AuthInfo,
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { readToken } from "../../../clinic-login";
import { createServer } from "./server";

// The check picks a free port and passes it in MCP_PORT.
const port = Number(process.env.MCP_PORT ?? 8787);

// Turns a token into what the server knows about the caller. A bad token becomes a 401.
async function verifyAccessToken(token: string): Promise<AuthInfo> {
  try {
    const claims = await readToken(token);
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
  // Mistake: no resourceMetadataUrl. A 401 then does not say where to sign in.
});

const mcpHandler = createMcpHandler(() => createServer());

async function handleRequest(request: Request): Promise<Response> {
  const badHost = hostHeaderValidationResponse(request, localhostAllowedHostnames());
  if (badHost) {
    return badHost;
  }
  // Mistake: no protected resource metadata, so a client cannot find the sign-in server.
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
