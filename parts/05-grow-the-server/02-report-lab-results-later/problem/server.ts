// The lab-results server. Check it with: bun run verify report-lab-results-later
//
// TODO: a blood panel takes minutes, and this tool waits for it. The model, the host and the
// person all wait too, and a long wait can time out. Change it so that:
//   1. order_blood_panel returns at once with { taskId, status: "working" } as structuredContent;
//   2. a new tool, blood_panel_status, takes the taskId and returns working, completed or
//      cancelled, with the results once completed;
//   3. a new tool, cancel_blood_panel, takes the taskId and calls lab.cancel.
// The lab module has lab.status, lab.results and lab.cancel for this.
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { clinic } from "#clinic";
import { lab } from "../lab/lab";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

async function orderBloodPanel({ patientId }: { patientId: string }) {
  const patient = clinic.patient(patientId);
  if (!patient) return textResult(`No patient with patientId "${patientId}".`);
  const orderId = lab.orderBloodPanel(patientId);
  const results = await lab.waitForResults(orderId);
  const lines = results.map((result) => `${result.test} ${result.value} ${result.unit}`);
  return textResult(`Blood panel for ${patient.name}: ${lines.join(", ")}`);
}

function createServer(): McpServer {
  const server = new McpServer({ name: "harrow-lab", version: "1.0.0" });
  server.registerTool(
    "order_blood_panel",
    {
      description: "Order a blood panel and wait for the results.",
      inputSchema: z.object({ patientId: z.string().describe("Patient id, for example P-0001") }),
    },
    orderBloodPanel,
  );
  return server;
}

serveStdio(createServer);
console.error("harrow-lab server running on stdio");
