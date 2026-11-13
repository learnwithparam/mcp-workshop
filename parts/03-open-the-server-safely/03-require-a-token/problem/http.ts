// Serve the Harrow Lane MCP server over Streamable HTTP, so every desk in the clinic can reach it.
// Start it with: bun http.ts   (it listens on http://127.0.0.1:8787/mcp)
// Check it with: bun run verify require-a-token
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
} from "@modelcontextprotocol/server";
import { createServer } from "./server";

// The check picks a free port and passes it in MCP_PORT.
const port = Number(process.env.MCP_PORT ?? 8787);

// One fresh server per request: no session, nothing to remember between calls.
const mcpHandler = createMcpHandler(() => createServer());

async function handleRequest(request: Request): Promise<Response> {
  // A web page on another site can make your browser send requests to 127.0.0.1.
  // Checking the Host header stops that trick, called DNS rebinding. The SDK leaves it to you.
  const badHost = hostHeaderValidationResponse(request, localhostAllowedHostnames());
  if (badHost) {
    return badHost;
  }
  const path = new URL(request.url).pathname;
  if (path !== "/mcp") {
    return new Response("Not found", { status: 404 });
  }
  // TODO 1: answer the protected resource metadata before the path check:
  //         oauthMetadataResponse(request, { oauthMetadata, resourceServerUrl }).
  // TODO 2: check the Bearer token with requireBearerAuth({ verifier, resourceMetadataUrl }).
  //         Its verifier turns readToken(token) from "../../clinic-login" into an AuthInfo.
  //         A Response back from it is the 401: return it as it is.
  // TODO 3: pass the caller on: mcpHandler.fetch(request, { authInfo }).
  return mcpHandler.fetch(request);
}

Bun.serve({ hostname: "127.0.0.1", port, fetch: handleRequest });
// stdout is free over HTTP, but the log line goes to stderr like before.
console.error(`harrow-lane server listening on http://127.0.0.1:${port}/mcp`);
