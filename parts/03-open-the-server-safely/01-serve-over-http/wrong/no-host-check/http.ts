// Serve the Harrow Lane MCP server over Streamable HTTP, so every desk in the clinic can reach it.
// Start it with: bun http.ts   (it listens on http://127.0.0.1:8787/mcp)
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "./server";

// The check picks a free port and passes it in MCP_PORT.
const port = Number(process.env.MCP_PORT ?? 8787);

// One fresh server per request: no session, nothing to remember between calls.
const mcpHandler = createMcpHandler(() => createServer());

async function handleRequest(request: Request): Promise<Response> {
  // Mistake: no Host check. The server only listens on 127.0.0.1, so it looks safe,
  // but a web page can still reach it through the browser (DNS rebinding).
  const path = new URL(request.url).pathname;
  if (path !== "/mcp") {
    return new Response("Not found", { status: 404 });
  }
  return mcpHandler.fetch(request);
}

Bun.serve({ hostname: "127.0.0.1", port, fetch: handleRequest });
// stdout is free over HTTP, but the log line goes to stderr like before.
console.error(`harrow-lane server listening on http://127.0.0.1:${port}/mcp`);
