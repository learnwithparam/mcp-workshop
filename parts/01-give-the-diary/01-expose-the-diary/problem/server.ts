// Your Harrow Lane MCP server. Check it with: bun run verify expose-the-diary
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { clinic } from "#clinic";

function createServer(): McpServer {
  const server = new McpServer({ name: "harrow-lane", version: "0.1.0" });

  // TODO: register a tool called find_free_slots.
  // It takes a site (harrow-lane, millbrook or eastgate), an optional date and a length in minutes,
  // and answers with clinic.freeSlots({ site, date, length }). Give the tool and each argument a description.

  return server;
}

serveStdio(createServer);
console.error("harrow-lane server running on stdio"); // stderr is safe; stdout belongs to the protocol
