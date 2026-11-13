// eval-tool-choice: a baseline score for the 14-tool API mirror, read honestly. The check reads the
// saved report and the learner's notes. It re-scores every task from the calls the report holds,
// so a hand-edited score or pass flag is caught.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type EvalReport,
  loadTasks,
  MIRROR,
  type TaskResult,
  taskPasses,
} from "../parts/02-pick-the-right-tool/eval";
import { rule } from "./lib/rules";

const MIRROR_TOOL_COUNT = 14;

function readReport(dir: string): EvalReport | undefined {
  const reportPath = join(dir, "evals", "baseline.json");
  if (!existsSync(reportPath)) return undefined;
  try {
    return JSON.parse(readFileSync(reportPath, "utf8")) as EvalReport;
  } catch {
    return undefined;
  }
}

function readNotes(dir: string): string {
  const notesPath = join(dir, "evals", "notes.md");
  if (!existsSync(notesPath)) return "";
  return readFileSync(notesPath, "utf8");
}

/** The text after "<label>:" on its own line in the notes, or "" when it is missing. */
function noteValue(notes: string, label: string): string {
  const line = notes.split("\n").find((candidate) => candidate.startsWith(`${label}:`));
  if (!line) return "";
  return line.slice(label.length + 1).trim();
}

function hasEveryTask(report: EvalReport | undefined): boolean {
  const tasks = report?.tasks;
  if (!Array.isArray(tasks) || tasks.length !== loadTasks().length) return false;
  return tasks.every(
    (task) =>
      typeof task.id === "string" &&
      Array.isArray(task.calls) &&
      typeof task.pass === "boolean" &&
      typeof task.estimatedTokens === "number",
  );
}

// Each pass flag must follow from the calls the report itself recorded.
function scoredHonestly(report: EvalReport): boolean {
  const tasksById = new Map(loadTasks().map((task) => [task.id, task]));
  const everyFlagRight = report.tasks.every((result) => {
    const task = tasksById.get(result.id);
    return task !== undefined && taskPasses(task, result.calls) === result.pass;
  });
  const passing = report.tasks.filter((result) => result.pass).length;
  return everyFlagRight && report.score === passing;
}

function namedTask(dir: string): TaskResult | undefined {
  const taskId = noteValue(readNotes(dir), "The worst mix-up").split(/\s/)[0];
  return readReport(dir)?.tasks.find((result) => result.id === taskId);
}

// The tool the notes name must be one the model really called in that task, and a wrong one.
function namesTheWrongTool(dir: string): boolean {
  const result = namedTask(dir);
  const tool = noteValue(readNotes(dir), "The tool the model called instead").split(/\s/)[0];
  const task = loadTasks().find((candidate) => candidate.id === result?.id);
  if (!result || !task) return false;
  const calledIt = result.calls.some((call) => call.tool === tool);
  const rightTools = [task.expected.tool, task.mirror.tool];
  return calledIt && !rightTools.includes(tool);
}

export default [
  rule(
    "evals/baseline.json holds a result for each of the 20 tasks",
    (dir) => hasEveryTask(readReport(dir)),
    "run the eval with --save and the path to evals/baseline.json in your problem folder " +
      "(the Walkthrough has the full command)",
  ),
  rule(
    "The baseline is a run of the 14-tool API mirror",
    (dir) => {
      const report = readReport(dir);
      return report?.server === MIRROR && report.toolCount === MIRROR_TOOL_COUNT;
    },
    "a baseline measures the server you start from: run the eval on api-mirror, not on your own " +
      "server",
  ),
  rule(
    "Every pass and fail in the baseline matches the calls it recorded",
    (dir) => {
      const report = readReport(dir);
      return Boolean(report && hasEveryTask(report) && scoredHonestly(report));
    },
    "do not edit baseline.json by hand; run the eval again and keep the file it writes",
  ),
  rule(
    "notes.md gives the same score as baseline.json",
    (dir) => {
      const report = readReport(dir);
      const score = noteValue(readNotes(dir), "Score");
      return Boolean(report) && score === `${report?.score}/${report?.total}`;
    },
    'write the score as it prints, for example "Score: 12/20"',
  ),
  rule(
    "notes.md names a task that failed in the baseline",
    (dir) => namedTask(dir)?.pass === false,
    'pick a FAIL line from the eval output and write its id after "The worst mix-up:"',
  ),
  rule(
    "notes.md names the wrong tool the model called in that task",
    namesTheWrongTool,
    "copy the tool name from the called column of that FAIL line; it is not the expected tool",
  ),
  rule(
    "notes.md says in a sentence why the model picked wrong",
    (dir) => {
      const reason = noteValue(readNotes(dir), "Why I think it picked wrong");
      return !reason.includes("TODO") && reason.split(/\s+/).length >= 8;
    },
    "look at the tool names and descriptions the model saw, and write what misled it",
  ),
];
