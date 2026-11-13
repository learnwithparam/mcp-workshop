// Serve the Harrow Lane MCP server over Streamable HTTP, so every desk in the clinic can reach it.
// Start it with: bun http.ts   (it listens on http://127.0.0.1:8787/mcp)
// Check it with: bun run verify serve-over-http

// The check picks a free port and passes it in MCP_PORT.
const port = Number(process.env.MCP_PORT ?? 8787);

// TODO 1: import createMcpHandler, hostHeaderValidationResponse and localhostAllowedHostnames
//         from "@modelcontextprotocol/server", and createServer from "./server".
// TODO 2: make one handler: createMcpHandler(() => createServer()).
// TODO 3: in handleRequest, refuse a Host header that is not local (403),
//         answer 404 for any path but /mcp, and hand the rest to the handler.

async function handleRequest(_request: Request): Promise<Response> {
  return new Response("TODO: serve MCP here", { status: 404 });
}

Bun.serve({ hostname: "127.0.0.1", port, fetch: handleRequest });
console.error(`harrow-lane server listening on http://127.0.0.1:${port}/mcp`);
