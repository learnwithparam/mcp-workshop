// The tool-choice eval for Part 2. It gives 20 front-desk tasks to a model that can use one MCP
// server's tools, then scores each task: did the model call the right tool with the right inputs?
//
//   bun parts/02-pick-the-right-tool/eval.ts api-mirror --save <file>        the 14-tool server
//   bun parts/02-pick-the-right-tool/eval.ts <server folder> --save <file>   your server
//
// With LLM_PROVIDER=replay (the default) the model's choices are played back from a recording, so
// it needs no key. Every run starts from a fresh copy of the diary, so your own diary stays as it
// is.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { freshWorld } from "../../checks/lib/world";
import { REPLAY_DIR } from "../../config/llm";
import { provider } from "../../config/models";
import { runAgent, type ToolCallSeen } from "../../world/agent";
import { type Connected, connectFolder } from "../../world/connect";

const PART_DIR = import.meta.dir;
export const MIRROR = "api-mirror";
export const JOB_TOOLS = [
  "find_patient",
  "find_free_slots",
  "book_appointment",
  "move_appointment",
  "vaccines_due",
];

type ExpectedCall = { tool: string; args: Record<string, unknown> };
export type Task = { id: string; task: string; expected: ExpectedCall; mirror: ExpectedCall };
export type CallMade = { tool: string; args: Record<string, unknown>; isError: boolean };
export type TaskResult = {
  id: string;
  task: string;
  expectedTool: string;
  calls: CallMade[];
  pass: boolean;
  estimatedTokens: number;
};
export type EvalReport = {
  server: string;
  provider: string;
  toolCount: number;
  toolNames: string[];
  score: number;
  total: number;
  estimatedTokens: number;
  tasks: TaskResult[];
};

export function loadTasks(): Task[] {
  const lines = readFileSync(join(PART_DIR, "tasks.jsonl"), "utf8").trim().split("\n");
  return lines.map((line) => JSON.parse(line) as Task);
}

// Strings match without caring about case or spaces at the ends; numbers must be equal.
function sameValue(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "string" && typeof actual === "string") {
    const plainExpected = expected.trim().toLowerCase();
    const plainActual = actual.trim().toLowerCase();
    return plainExpected === plainActual;
  }
  return expected === actual;
}

function callMatches(call: CallMade, expected: ExpectedCall): boolean {
  if (call.tool !== expected.tool || call.isError) {
    return false;
  }
  const expectedArgs = Object.entries(expected.args);
  return expectedArgs.every(([name, value]) => sameValue(value, call.args[name]));
}

/**
 * A task passes when one call used the expected tool with the expected inputs, and it worked.
 * The API mirror names its tools differently, so its own way of doing the job counts too.
 */
export function taskPasses(task: Task, calls: CallMade[]): boolean {
  return calls.some((call) => callMatches(call, task.expected) || callMatches(call, task.mirror));
}

/** The recording that plays back a model's choices for this list of tools, if there is one. */
function recordingFor(server: string, toolNames: string[]): string | undefined {
  if (server === MIRROR) {
    return "recorded-api-mirror.json";
  }
  const hasEveryJobTool = JOB_TOOLS.every((name) => toolNames.includes(name));
  if (hasEveryJobTool) {
    return "recorded-job-tools.json";
  }
  return undefined;
}

function noRecordingMessage(toolNames: string[]): string {
  return (
    `There is no recording for a server with the tools ${toolNames.join(", ")}. ` +
    "The recordings cover the 14-tool API mirror and the five job tools: " +
    `${JOB_TOOLS.join(", ")}. ` +
    "Name your tools like that, or set LLM_PROVIDER and a key in .env to run a live model."
  );
}

// A rough count that every provider shares: about four characters make one token.
function estimateTokens(characters: number): number {
  return Math.ceil(characters / 4);
}

function connect(server: string, env: Record<string, string>): Promise<Connected> {
  if (server === MIRROR) {
    return connectFolder(PART_DIR, { env, launch: { command: "bun", args: ["api-mirror.ts"] } });
  }
  return connectFolder(server, { env });
}

type TaskRun = { task: Task; toolListCharacters: number; recording?: string };

async function runTask(connection: Connected, run: TaskRun): Promise<TaskResult> {
  const replayFile = run.recording && relative(REPLAY_DIR, join(PART_DIR, run.recording));
  let seen: ToolCallSeen[] = [];
  let modelTurns = 1;
  try {
    const result = await runAgent(connection.client, run.task.task, { replayFile });
    seen = result.calls;
    modelTurns = result.steps.length;
  } catch {
    // A model that calls a tool the server does not have, or crashes, simply fails the task.
  }
  const calls = seen.map((call) => ({ tool: call.name, args: call.input, isError: call.isError }));
  const resultCharacters = seen.reduce((total, call) => total + call.text.length, 0);
  const sentCharacters = run.toolListCharacters * modelTurns + run.task.task.length;
  return {
    id: run.task.id,
    task: run.task.task,
    expectedTool: run.task.expected.tool,
    calls,
    pass: taskPasses(run.task, calls),
    estimatedTokens: estimateTokens(sentCharacters + resultCharacters),
  };
}

/** Runs every task against one server, on a fresh copy of the diary. */
export async function runEval(server: string): Promise<EvalReport> {
  const world = freshWorld();
  const connection = await connect(server, world.env);
  try {
    const { tools } = await connection.client.listTools();
    const toolNames = tools.map((tool) => tool.name);
    const recording = recordingFor(server, toolNames);
    if (provider() === "replay" && !recording) {
      throw new Error(noRecordingMessage(toolNames));
    }
    const toolListCharacters = JSON.stringify(tools).length;
    const results: TaskResult[] = [];
    for (const task of loadTasks()) {
      results.push(await runTask(connection, { task, toolListCharacters, recording }));
    }
    return reportFrom({ server, toolNames, results });
  } finally {
    await connection.close().catch(() => {});
  }
}

type ReportParts = { server: string; toolNames: string[]; results: TaskResult[] };

function reportFrom({ server, toolNames, results }: ReportParts): EvalReport {
  const passing = results.filter((result) => result.pass);
  const tokens = results.reduce((total, result) => total + result.estimatedTokens, 0);
  return {
    server,
    provider: provider(),
    toolCount: toolNames.length,
    toolNames,
    score: passing.length,
    total: results.length,
    estimatedTokens: tokens,
    tasks: results,
  };
}

function printReport(report: EvalReport) {
  console.log(`Eval of ${report.server} (${report.toolCount} tools, provider ${report.provider}):`);
  for (const result of report.tasks) {
    const mark = result.pass ? "PASS" : "FAIL";
    const called = result.calls.map((call) => call.tool).join(", ") || "no tool";
    const expected = `expected ${result.expectedTool}`.padEnd(26);
    console.log(`  ${mark}  ${result.id}  ${expected} called ${called}`);
  }
  const tokens = report.estimatedTokens.toLocaleString("en-GB");
  console.log(`Score: ${report.score}/${report.total}. Estimated tokens: ${tokens}.`);
}

function saveReport(report: EvalReport, file: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Saved ${file}`);
}

async function main() {
  const args = process.argv.slice(2);
  const savePosition = args.indexOf("--save");
  const saveFile = savePosition >= 0 ? args.splice(savePosition, 2)[1] : undefined;
  const server = args[0];
  if (!server) {
    console.log("Name a server: api-mirror, or a step folder such as .../problem");
    process.exit(1);
  }
  try {
    const report = await runEval(server);
    printReport(report);
    if (saveFile) {
      saveReport(report, saveFile);
    }
  } catch (error) {
    console.log(`The eval could not run: ${(error as Error).message}`);
    process.exit(2);
  }
  // The connect timer in world/connect.ts would keep the process alive for a while, so stop here.
  process.exit(0);
}

if (import.meta.main) {
  await main();
}
