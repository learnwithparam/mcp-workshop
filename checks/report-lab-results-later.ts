// report-lab-results-later: order_blood_panel returns a task handle at once, blood_panel_status
// moves from working to completed with the lab's results, and cancel_blood_panel stops a task.
// The lab takes LAB_TURNAROUND_MS, set short here so the check is quick.
import type { Client } from "@modelcontextprotocol/client";
import { connectFolder } from "../world/connect";
import { call, type ToolResult } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";
import { freshWorld } from "./lib/world";

const TURNAROUND_MS = 1500;
const QUICK_ANSWER_MS = 1000;
const UNKNOWN_TASK = "LAB-9999";

type TaskView = { taskId?: string; status?: string; results?: { test: string; value: number }[] };

function taskOf(result: ToolResult): TaskView {
  return (result.structured ?? {}) as TaskView;
}

async function orderPanel(client: Client) {
  const startedAt = Date.now();
  const order = await call(client, "order_blood_panel", { patientId: "P-0001" });
  return { task: taskOf(order), answeredInMs: Date.now() - startedAt };
}

async function statusOf(client: Client, taskId: string | undefined): Promise<TaskView> {
  const status = await call(client, "blood_panel_status", { taskId });
  return taskOf(status);
}

/** Orders one panel and follows it to the end; orders a second one and cancels it. */
async function followTwoPanels(client: Client) {
  const first = await orderPanel(client);
  const firstStatus = await statusOf(client, first.task.taskId);
  const second = await orderPanel(client);
  const cancelled = taskOf(
    await call(client, "cancel_blood_panel", { taskId: second.task.taskId }),
  );
  await Bun.sleep(TURNAROUND_MS + 300);
  const laterStatus = await statusOf(client, first.task.taskId);
  const cancelledLater = await statusOf(client, second.task.taskId);
  const unknown = await call(client, "blood_panel_status", { taskId: UNKNOWN_TASK });
  return { first, firstStatus, laterStatus, cancelled, cancelledLater, unknown };
}

const run = scenario(async (dir) => {
  // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
  const env = { ...freshWorld().env, LAB_TURNAROUND_MS: String(TURNAROUND_MS) };
  const connection = await connectFolder(dir, { env });
  try {
    return await followTwoPanels(connection.client);
  } finally {
    await connection.close().catch(() => {});
  }
});

type Seen = Awaited<ReturnType<typeof followTwoPanels>>;

async function judged(dir: string, judge: (seen: Seen) => boolean): Promise<boolean> {
  const seen = await run(dir);
  return !failed(seen) && judge(seen);
}

let orderTook = 0;

export default [
  rule(
    "order_blood_panel answers in under one second, while the lab still works",
    (dir) =>
      judged(dir, (seen) => {
        orderTook = seen.first.answeredInMs;
        return orderTook < QUICK_ANSWER_MS;
      }),
    () =>
      `the order took ${orderTook} ms. Do not call lab.waitForResults: ` +
      "start the panel with lab.orderBloodPanel and return at once",
  ),
  rule(
    'Its structured result has a taskId and status "working"',
    (dir) =>
      judged(
        dir,
        (seen) => Boolean(seen.first.task.taskId) && seen.first.task.status === "working",
      ),
    'return structuredContent: { taskId, status: "working" }, with an outputSchema for it',
  ),
  rule(
    "blood_panel_status says working at first, then completed with the lab's results",
    (dir) =>
      judged(dir, (seen) => {
        const results = seen.laterStatus.results ?? [];
        const hasPanel = results.some((result) => result.test === "PCV" && result.value === 45);
        return (
          seen.firstStatus.status === "working" &&
          seen.laterStatus.status === "completed" &&
          hasPanel
        );
      }),
    "add blood_panel_status: read lab.status(taskId), and add lab.results(taskId) once completed",
  ),
  rule(
    "cancel_blood_panel stops a working task, and it stays cancelled",
    (dir) =>
      judged(
        dir,
        (seen) =>
          seen.cancelled.status === "cancelled" && seen.cancelledLater.status === "cancelled",
      ),
    "call lab.cancel(taskId) in cancel_blood_panel, then report lab.status(taskId)",
  ),
  rule(
    "An unknown taskId gets an error that names it",
    (dir) =>
      judged(dir, (seen) => seen.unknown.isError && seen.unknown.text.includes(UNKNOWN_TASK)),
    'when lab.status(taskId) is "unknown", return isError: true and name the taskId',
  ),
];
