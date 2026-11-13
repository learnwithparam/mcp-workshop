// mark-risky-tools: every tool tells the client, in its annotations, whether it changes the diary.
// The check reads tools/list and compares each tool's annotations with the step's table.
import { listTools, withServer } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";

type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
type Tool = { name: string; annotations?: Annotations };

const READ_TOOLS = ["find_patient", "find_free_slots", "vaccines_due"];

const run = scenario(async (dir) =>
  withServer(dir, async ({ client }) => (await listTools(client)).tools as Tool[]),
);

async function annotationsOf(dir: string, name: string): Promise<Annotations | undefined> {
  const tools = await run(dir);
  if (failed(tools)) return undefined;
  return tools.find((tool) => tool.name === name)?.annotations;
}

export default [
  rule(
    "The server starts and lists its tools",
    async (dir) => !failed(await run(dir)),
    'run "bun server.ts" in the problem folder and fix the first error it prints',
  ),
  rule(
    "find_patient, find_free_slots and vaccines_due are marked read-only",
    async (dir) => {
      for (const name of READ_TOOLS) {
        if ((await annotationsOf(dir, name))?.readOnlyHint !== true) return false;
      }
      return true;
    },
    "add annotations: { readOnlyHint: true } to each tool that only reads",
  ),
  rule(
    "book_appointment is a write that is not destructive and not idempotent",
    async (dir) => {
      const hints = await annotationsOf(dir, "book_appointment");
      return (
        hints?.readOnlyHint === false &&
        hints.destructiveHint === false &&
        hints.idempotentHint === false
      );
    },
    "set all three hints; destructiveHint is true by default, and booking twice makes two " +
      "appointments",
  ),
  rule(
    "move_appointment is a write that is not destructive and is idempotent",
    async (dir) => {
      const hints = await annotationsOf(dir, "move_appointment");
      return (
        hints?.readOnlyHint === false &&
        hints.destructiveHint === false &&
        hints.idempotentHint === true
      );
    },
    "set all three hints; moving to the same time twice leaves the diary as one move did",
  ),
];
