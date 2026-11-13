// A thin MCP proxy: one address for the clinic server and the lab server.
//   PORT=8800 PUBLIC_URL=http://127.0.0.1:8800/mcp CLINIC_URL=... LAB_URL=... bun proxy.ts
// It accepts only tokens minted for its own address, mints a new token for each upstream, adds a
// prefix to every tool name, and drops any lab tool that is not in pins.json.
// Check it with: bun run verify front-two-servers
import {
  type AuthInfo,
  type CallToolResult,
  createMcpHandler,
  fromJsonSchema,
  getOAuthProtectedResourceMetadataUrl,
  McpServer,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { readToken } from "../../../../../world/auth";
import { fingerprint, pinnedFingerprints } from "./pins";
import {
  type Caller,
  callUpstreamTool,
  listUpstreamTools,
  type Upstream,
  type UpstreamTool,
} from "./upstream";

type Route = { upstream: Upstream; tool: UpstreamTool };

const port = Number(process.env.PORT ?? 8800);
const publicUrl = new URL(process.env.PUBLIC_URL ?? `http://127.0.0.1:${port}/mcp`);
const clinic: Upstream = { prefix: "clinic", url: process.env.CLINIC_URL ?? "" };
const lab: Upstream = { prefix: "lab", url: process.env.LAB_URL ?? "" };

// The proxy lists the upstream tools once, at start, as itself.
const proxyItself: Caller = {
  staffId: "harrow-lane-proxy",
  role: "director",
  site: "harrow-lane",
  scopes: ["diary:read", "diary:write", "notes:read", "drugs:read"],
};

/** Every clinic tool, and only the lab tools whose fingerprint is pinned. */
async function loadRoutes(): Promise<Route[]> {
  const pinned = pinnedFingerprints();
  const clinicTools = await listUpstreamTools(clinic, proxyItself);
  const labTools = await listUpstreamTools(lab, proxyItself);
  const pinnedLabTools = labTools.filter((tool) => pinned.has(fingerprint(tool)));
  for (const tool of labTools)
    if (!pinned.has(fingerprint(tool))) console.error(`Dropped lab tool ${tool.name}: not pinned.`);
  const clinicRoutes = clinicTools.map((tool) => ({ upstream: clinic, tool }));
  const labRoutes = pinnedLabTools.map((tool) => ({ upstream: lab, tool }));
  return [...clinicRoutes, ...labRoutes];
}

function callerFrom(auth: AuthInfo): Caller {
  const extra = auth.extra as { role: string; site: string };
  return {
    staffId: auth.clientId,
    role: extra.role,
    site: extra.site,
    scopes: auth.scopes,
    inboundToken: auth.token,
  };
}

function createServer(routes: Route[], caller: Caller): McpServer {
  const server = new McpServer({ name: "harrow-lane-proxy", version: "1.0.0" });
  for (const { upstream, tool } of routes) {
    server.registerTool(
      `${upstream.prefix}_${tool.name}`,
      {
        description: `[${upstream.prefix}] ${tool.description ?? ""}`,
        inputSchema: fromJsonSchema(tool.inputSchema),
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>) => {
        const call = { name: tool.name, arguments: args };
        const result = await callUpstreamTool(upstream, caller, call);
        return result as CallToolResult;
      },
    );
  }
  return server;
}

async function verifyAccessToken(token: string): Promise<AuthInfo> {
  try {
    const claims = await readToken(token);
    const audiences = [claims.aud].flat();
    return {
      token,
      clientId: claims.sub,
      scopes: claims.scope.split(" "),
      expiresAt: claims.exp,
      resource: audiences.includes(publicUrl.href) ? publicUrl : undefined,
      extra: { role: claims.role, site: claims.site },
    };
  } catch (error) {
    throw new OAuthError(OAuthErrorCode.InvalidToken, (error as Error).message);
  }
}

const routes = await loadRoutes();
const checkBearerToken = requireBearerAuth({
  verifier: { verifyAccessToken },
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(publicUrl),
  expectedResource: publicUrl,
});
const handler = createMcpHandler(({ authInfo }) =>
  createServer(routes, callerFrom(authInfo as AuthInfo)),
);

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const auth = await checkBearerToken(request);
    if (auth instanceof Response) return auth;
    return handler.fetch(request, { authInfo: auth });
  },
});
console.log(`The proxy serves ${routes.length} tools on ${publicUrl.href}`);
