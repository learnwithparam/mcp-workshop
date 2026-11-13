// The lab's old MCP server, written before the 2026-07-28 protocol. It is fictional.
// It speaks only the 2025-11-25 protocol: it needs "initialize" first, and it does not know
// "server/discover". It is written by hand, without the SDK, so you can read every message.
import { createInterface } from "node:readline";

type Message = { id?: number | string; method?: string };

const TOOLS = [
  {
    name: "lab_status",
    description: "Say whether the Harrow Lane lab is open and how long blood panels take today.",
    inputSchema: { type: "object", properties: {} },
  },
];

function answer(id: Message["id"], result: unknown) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function refuse(id: Message["id"], method: string) {
  const error = { code: -32601, message: `Method not found: ${method}` };
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error })}\n`);
}

function handle(message: Message) {
  // A message without an id is a notification, such as notifications/initialized. No reply.
  if (message.id === undefined) return;
  const method = message.method ?? "";
  if (method === "initialize") {
    answer(message.id, {
      protocolVersion: "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: { name: "harrow-lab-legacy", version: "1.2.0" },
    });
  } else if (method === "tools/list") {
    answer(message.id, { tools: TOOLS });
  } else if (method === "tools/call") {
    answer(message.id, {
      content: [{ type: "text", text: "The lab is open. Blood panels take about 40 minutes." }],
    });
  } else {
    refuse(message.id, method);
  }
}

console.error("harrow-lab-legacy 1.2.0 running on stdio (2025-11-25 only)");
for await (const line of createInterface({ input: process.stdin })) {
  if (line.trim()) handle(JSON.parse(line) as Message);
}
