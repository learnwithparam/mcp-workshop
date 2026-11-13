// Your Harrow Lane MCP server. Check it with: bun run verify expose-the-diary
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

// ---- the server: give each tool a name and a description the model reads ----

function createServer(): McpServer {
  const server = new McpServer({ name: "harrow-lane", version: "0.1.0" });

  // TODO: register a tool called find_free_slots.
  // First add these imports at the top of the file:
  //   import * as z from "zod/v4";
  //   import { clinic } from "#clinic";
  // It takes a site (harrow-lane, millbrook or eastgate), an optional date and a length in
  // minutes, and answers with clinic.freeSlots({ site, date, length }).
  // Give the tool and each argument a description.

  return server;
}

serveStdio(createServer);
// stdout carries the protocol messages, so log lines go to stderr.
console.error("harrow-lane server running on stdio");
