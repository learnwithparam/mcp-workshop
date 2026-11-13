// Serves one upstream MCP server over HTTP, the way the clinic runs its servers in production.
// It accepts a token only when the token's audience is exactly this server's own URL. It writes
// the audience of every token it receives to UPSTREAM_LOG, so a check can see what the proxy sent.
import { appendFileSync } from "node:fs";
import {
  type AuthInfo,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  type McpServer,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { decodeJwt } from "jose";
import { readToken } from "../../../../world/auth";

type Upstream = { name: string; createServer: (auth: AuthInfo) => McpServer };

/** Writes who sent a token and for which audience, before the token is checked. */
function logToken(serverName: string, request: Request) {
  const logPath = process.env.UPSTREAM_LOG;
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!logPath || !token) return;
  const claims = decodeJwt(token);
  const line = { server: serverName, audience: claims.aud, subject: claims.sub };
  appendFileSync(logPath, `${JSON.stringify(line)}\n`);
}

async function verifyAccessToken(token: string, ownUrl: URL): Promise<AuthInfo> {
  try {
    const claims = await readToken(token);
    const audiences = [claims.aud].flat();
    return {
      token,
      clientId: claims.sub,
      scopes: claims.scope.split(" "),
      expiresAt: claims.exp,
      resource: audiences.includes(ownUrl.href) ? ownUrl : undefined,
      extra: { role: claims.role, site: claims.site },
    };
  } catch (error) {
    throw new OAuthError(OAuthErrorCode.InvalidToken, (error as Error).message);
  }
}

export function serveUpstream(upstream: Upstream) {
  const port = Number(process.env.PORT);
  const ownUrl = new URL(`http://127.0.0.1:${port}/mcp`);
  const checkBearerToken = requireBearerAuth({
    verifier: { verifyAccessToken: (token) => verifyAccessToken(token, ownUrl) },
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(ownUrl),
    expectedResource: ownUrl,
  });
  const handler = createMcpHandler(({ authInfo }) => upstream.createServer(authInfo as AuthInfo));
  Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
      logToken(upstream.name, request);
      const auth = await checkBearerToken(request);
      if (auth instanceof Response) return auth;
      return handler.fetch(request, { authInfo: auth });
    },
  });
  console.log(`${upstream.name} upstream listening on ${ownUrl.href}`);
}
