// The Harrow Lane HTTP front, with one trace span for every tool call.
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
import { ISSUER, readToken } from "../../../../../world/auth";
import { callerFrom, createServer } from "../../../../../world/finished/server";

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

// One span for each tool call, sent to a collector in the OTLP JSON format. The collector address
// comes from OTEL_EXPORTER_OTLP_ENDPOINT. When it is not set, nothing is sent.
const COLLECTOR = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const NANOS_PER_MS = 1_000_000n;

type Call = { method?: string; params?: { name?: string } };

const randomHex = (bytes: number) =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("hex");
const nowNanos = () => BigInt(Date.now()) * NANOS_PER_MS;
const text = (key: string, value: string) => ({ key, value: { stringValue: value } });

/** The trace id from a W3C traceparent header such as 00-<32 hex>-<16 hex>-01, if it has one. */
function incomingTrace(request: Request): { traceId: string; parentId: string } | undefined {
  const match = request.headers
    .get("traceparent")
    ?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/);
  return match ? { traceId: match[1], parentId: match[2] } : undefined;
}

/** The tool name when this request is an MCP tools/call, read from a copy of the body. */
async function toolCallIn(request: Request): Promise<string | undefined> {
  if (request.method !== "POST") return undefined;
  const call = (await request
    .clone()
    .json()
    .catch(() => ({}))) as Call;
  return call.method === "tools/call" ? call.params?.name : undefined;
}

/** Sends one span. A collector that is down or slow must never slow or break a tool call. */
function exportSpan(span: Record<string, unknown>): void {
  if (!COLLECTOR) return;
  const body = {
    resourceSpans: [
      {
        resource: { attributes: [text("service.name", "harrow-lane-mcp")] },
        scopeSpans: [{ scope: { name: "harrow-lane" }, spans: [span] }],
      },
    ],
  };
  fetch(new URL("/v1/traces", COLLECTOR), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}

/** Runs one tool call and records a span for it. Only names and outcomes go in, never arguments. */
async function traced(request: Request, tool: string, run: () => Promise<Response>) {
  const incoming = incomingTrace(request);
  const startedAt = nowNanos();
  const answer = await run();
  const body = await answer.clone().text();
  const failedCall = !answer.ok || /"isError":\s*true|"error":\s*\{/.test(body);
  const attributes = [
    text("mcp.method.name", "tools/call"),
    text("gen_ai.operation.name", "execute_tool"),
    text("gen_ai.tool.name", tool),
    text("gen_ai.tool.call.arguments", await request.clone().text()),
  ];
  if (failedCall) attributes.push(text("error.type", "tool_error"));
  exportSpan({
    traceId: incoming?.traceId ?? randomHex(16),
    spanId: randomHex(8),
    parentSpanId: incoming?.parentId,
    name: `tools/call ${tool}`,
    kind: 2,
    startTimeUnixNano: String(startedAt),
    endTimeUnixNano: String(nowNanos()),
    attributes,
    status: { code: failedCall ? 2 : 1 },
  });
  return answer;
}

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
    const tool = await toolCallIn(request);
    const handle = () => mcpHandler.fetch(request, { authInfo: auth });
    return tool ? traced(request, tool, handle) : handle();
  },
};
