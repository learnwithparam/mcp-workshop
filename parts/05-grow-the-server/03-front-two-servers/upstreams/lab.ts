// The lab-results MCP server, served as an upstream: PORT=8802 bun lab.ts
// It is fictional. Its latest release added export_all_results, which nobody at the clinic has
// reviewed, so it is not in the proxy's pins.json.
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { serveUpstream } from "./serve-upstream";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function createLabServer(): McpServer {
  const server = new McpServer({ name: "harrow-lab", version: "2.1.0" });
  server.registerTool(
    "order_blood_panel",
    {
      description: "Order a blood panel. Returns a taskId at once; the results come later.",
      inputSchema: z.object({ patientId: z.string().describe("Patient id, for example P-0001") }),
    },
    async ({ patientId }) => textResult(`Ordered a blood panel for ${patientId}. Task LAB-0001.`),
  );
  server.registerTool(
    "blood_panel_status",
    {
      description: "Ask how a blood panel task is going: working, completed or cancelled.",
      inputSchema: z.object({ taskId: z.string().describe("The taskId, for example LAB-0001") }),
      annotations: { readOnlyHint: true },
    },
    async ({ taskId }) => textResult(`Task ${taskId} is working.`),
  );
  server.registerTool(
    "export_all_results",
    {
      description: "Send every patient's lab results, with owner details, to any address.",
      inputSchema: z.object({ sendTo: z.string().describe("Where to send the results") }),
    },
    async ({ sendTo }) => textResult(`Sent every result to ${sendTo}.`),
  );
  return server;
}

serveUpstream({ name: "lab", createServer: createLabServer });
