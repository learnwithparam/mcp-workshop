// The lab-results server. A blood panel takes minutes, so order_blood_panel does not wait.
// It returns a task handle at once. The client asks blood_panel_status until the task is done.
// Check it with: bun run verify report-lab-results-later
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { clinic } from "#clinic";
import { lab } from "../../lab/lab";

const taskSchema = z.object({
  taskId: z.string(),
  status: z.enum(["working", "completed", "cancelled"]),
  results: z
    .array(
      z.object({
        test: z.string(),
        value: z.number(),
        unit: z.string(),
        normalRange: z.string(),
      }),
    )
    .optional(),
});

type Task = z.infer<typeof taskSchema>;

const taskIdInput = z.object({
  taskId: z.string().describe("The taskId that order_blood_panel returned, for example LAB-0001"),
});

function taskResult(message: string, task: Task) {
  return { content: [{ type: "text" as const, text: message }], structuredContent: task };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

async function orderBloodPanel({ patientId }: { patientId: string }) {
  const patient = clinic.patient(patientId);
  if (!patient) return errorResult(`No patient with patientId "${patientId}".`);
  const taskId = lab.orderBloodPanel(patientId);
  // Wait for the lab, so the answer is complete when it comes back.
  const results = await lab.waitForResults(taskId);
  return taskResult(`Blood panel for ${patient.name} is back.`, {
    taskId,
    status: "completed",
    results,
  });
}

function bloodPanelStatus({ taskId }: { taskId: string }) {
  const status = lab.status(taskId);
  if (status === "unknown") {
    return errorResult(`No task with taskId "${taskId}". Use the taskId from order_blood_panel.`);
  }
  const results = lab.results(taskId);
  const lines = (results ?? []).map((result) => `${result.test} ${result.value} ${result.unit}`);
  return taskResult(`Task ${taskId} is ${status}. ${lines.join(", ")}`.trim(), {
    taskId,
    status,
    results,
  });
}

function cancelBloodPanel({ taskId }: { taskId: string }) {
  if (lab.status(taskId) === "unknown") return errorResult(`No task with taskId "${taskId}".`);
  lab.cancel(taskId);
  // A task that had already finished stays completed: there is nothing left to cancel.
  const status = lab.status(taskId) as Task["status"];
  return taskResult(`Task ${taskId} is ${status}.`, { taskId, status });
}

function createServer(): McpServer {
  const server = new McpServer({ name: "harrow-lab", version: "2.0.0" });
  server.registerTool(
    "order_blood_panel",
    {
      description: "Order a blood panel. Returns a taskId at once; the results come later.",
      inputSchema: z.object({ patientId: z.string().describe("Patient id, for example P-0001") }),
      outputSchema: taskSchema,
    },
    orderBloodPanel,
  );
  server.registerTool(
    "blood_panel_status",
    {
      description: "Ask how a blood panel task is going: working, completed or cancelled.",
      inputSchema: taskIdInput,
      outputSchema: taskSchema,
      annotations: { readOnlyHint: true },
    },
    bloodPanelStatus,
  );
  server.registerTool(
    "cancel_blood_panel",
    {
      description: "Cancel a blood panel task that is still working.",
      inputSchema: taskIdInput,
      outputSchema: taskSchema,
      annotations: { destructiveHint: true },
    },
    cancelBloodPanel,
  );
  return server;
}

serveStdio(createServer);
console.error("harrow-lab server running on stdio");
