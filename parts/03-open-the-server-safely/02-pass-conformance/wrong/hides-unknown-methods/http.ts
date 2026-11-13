// Serve the Harrow Lane MCP server over Streamable HTTP, so every desk in the clinic can reach it.
// Start it with: bun http.ts   (it listens on http://127.0.0.1:8787/mcp)
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
  const response = await mcpHandler.fetch(request);
  // Mistake: hide only "not found" answers. Clients that ask for a method the server
  // does not have now get a 200 and cannot tell what went wrong.
  if (response.status === 404) {
    return Response.json({ jsonrpc: "2.0", id: null, result: {} }, { status: 200 });
  }
  return response;
}

Bun.serve({ hostname: "127.0.0.1", port, fetch: handleRequest });
// stdout is free over HTTP, but the log line goes to stderr like before.
console.error(`harrow-lane server listening on http://127.0.0.1:${port}/mcp`);
