// shape-tools-around-jobs: five tools shaped around front-desk jobs, which a model picks right.
// The check reads tools/list twice, then runs the shipped eval against the server three times in
// replay mode and compares the score with the API mirror's baseline.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type EvalReport,
  JOB_TOOLS,
  loadTasks,
  MIRROR,
  runEval,
  taskPasses,
} from "../parts/02-pick-the-right-tool/eval";
import { listTools, withServer } from "./lib/mcp";
import { failed, rule, scenario, threeRuns } from "./lib/rules";

const MOST_TOOLS = 6;
const LEAST_SCORE = 18;
const LEAST_GAIN = 4;
const TOOL_NAME = /^[a-z]+(_[a-z]+)*$/;
// Input names that say nothing about what they hold.
const VAGUE_INPUT_NAMES = ["id", "query", "q", "data", "params", "value", "input"];

type Tool = { name: string; description?: string; inputSchema: { properties?: object } };

const readTools = scenario(async (dir) =>
  withServer(dir, async ({ client }) => {
    const first = (await listTools(client)).tools as Tool[];
    const second = (await listTools(client)).tools as Tool[];
    return { first, second };
  }),
);

async function tools(dir: string): Promise<Tool[] | undefined> {
  const outcome = await readTools(dir);
  return failed(outcome) ? undefined : outcome.first;
}

function firstWords(description: string | undefined, count: number): string {
  const words = (description ?? "").toLowerCase().split(/\s+/);
  return words.slice(0, count).join(" ");
}

let baseline: Promise<EvalReport> | undefined;

function mirrorBaseline(): Promise<EvalReport> {
  baseline ??= runEval(MIRROR);
  return baseline;
}

let lastScores: number[] = [];

const scoresWell = scenario(async (dir) => {
  lastScores = [];
  const least = (await mirrorBaseline()).score + LEAST_GAIN;
  return threeRuns(async () => {
    const report = await runEval(dir);
    lastScores.push(report.score);
    return report.score >= LEAST_SCORE && report.score >= least;
  });
});

// The eval stops before it scores when a tool name has no recording.
// Then there is no score to show.
function scoreHint(): string {
  if (lastScores.length === 0) {
    return (
      "the eval could not run on your server. Run it yourself (the command is in the step " +
      "README) and read its message. Most often one of the five job tools is missing or " +
      "spelled differently"
    );
  }
  return (
    "run the eval on your server and fix each FAIL line. " +
    `Scores seen: ${lastScores.join(", ")}. A tool error on a recorded call also fails the task`
  );
}

function readDesigned(dir: string): EvalReport | undefined {
  const reportPath = join(dir, "evals", "designed.json");
  if (!existsSync(reportPath)) return undefined;
  return JSON.parse(readFileSync(reportPath, "utf8")) as EvalReport;
}

async function designedIsHonest(dir: string): Promise<boolean> {
  const report = readDesigned(dir);
  const currentTools = await tools(dir);
  if (!report || !currentTools || report.tasks?.length !== loadTasks().length) return false;
  const sameTools = report.toolNames.join() === currentTools.map((tool) => tool.name).join();
  const tasksById = new Map(loadTasks().map((task) => [task.id, task]));
  const flagsRight = report.tasks.every((result) => {
    const task = tasksById.get(result.id);
    return task !== undefined && taskPasses(task, result.calls) === result.pass;
  });
  const passing = report.tasks.filter((result) => result.pass).length;
  return sameTools && flagsRight && report.score === passing && passing >= LEAST_SCORE;
}

export default [
  rule(
    "The server starts and lists its tools",
    async (dir) => !failed(await readTools(dir)),
    'run "bun server.ts" in the problem folder and fix the first error it prints',
  ),
  rule(
    "tools/list has the five job tools and at most 6 tools",
    async (dir) => {
      const names = ((await tools(dir)) ?? []).map((tool) => tool.name);
      return names.length <= MOST_TOOLS && JOB_TOOLS.every((name) => names.includes(name));
    },
    `register exactly these jobs: ${JOB_TOOLS.join(", ")}; drop the endpoint-shaped tools`,
  ),
  rule(
    "Every tool name is lower case words joined by underscores",
    async (dir) => {
      const found = (await tools(dir)) ?? [];
      return found.length > 0 && found.every((tool) => TOOL_NAME.test(tool.name));
    },
    "pick one style for every name, for example vaccines_due, never vaccinesDue or get-patient",
  ),
  rule(
    "Every input is named for what it holds",
    async (dir) => {
      const found = (await tools(dir)) ?? [];
      const inputNames = found.flatMap((tool) => Object.keys(tool.inputSchema.properties ?? {}));
      return found.length > 0 && !inputNames.some((name) => VAGUE_INPUT_NAMES.includes(name));
    },
    "rename id to patientId or appointmentId, and query to name, ownerName or ownerPhone",
  ),
  rule(
    "No two descriptions start with the same 8 words",
    async (dir) => {
      const found = (await tools(dir)) ?? [];
      const openings = found.map((tool) => firstWords(tool.description, 8));
      return found.length > 0 && new Set(openings).size === openings.length;
    },
    'open each description with what that tool does, for example "Find a patient by..."',
  ),
  rule(
    "tools/list gives the same order on two calls",
    async (dir) => {
      const outcome = await readTools(dir);
      if (failed(outcome)) return false;
      const firstOrder = outcome.first.map((tool) => tool.name).join();
      return firstOrder === outcome.second.map((tool) => tool.name).join();
    },
    "register the tools in a fixed order in createServer; do not build the list from a Set or " +
      "a random source",
  ),
  rule(
    "Over 3 replay runs the eval scores at least 18 of 20, and at least 4 above the baseline",
    async (dir) => (await scoresWell(dir)) === true,
    scoreHint,
  ),
  rule(
    "evals/designed.json is a saved eval run of this server that scores at least 18",
    designedIsHonest,
    "run the eval on your problem folder with --save and the path to evals/designed.json",
  ),
];
