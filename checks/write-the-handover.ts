// write-the-handover: HANDOVER.md has six sections, names every tool the finished server lists with
// its annotations, names every scope, and quotes the eval scores exactly as the eval JSON has them.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connectFinished } from "../world/connect";
import { rule } from "./lib/rules";

const SECTIONS = [
  "Tools",
  "Scopes",
  "Eval scores",
  "Threats and defences",
  "How to deploy",
  "Not done yet",
];
const SCOPES = ["diary:read", "diary:write", "notes:read", "drugs:read"];
// Each threat the part defends against, and words that show the handover names it.
const THREATS = [/poison/i, /inject|trifecta/i, /audience|another server/i];

type EvalFile = { passed?: number; score?: number; total?: number; tasks?: { pass?: boolean }[] };
type Score = { passed: number; total: number };
type ToolInfo = { name: string; readOnly: boolean; destructive: boolean };

function handover(dir: string): string {
  const path = join(dir, "HANDOVER.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

/** The text under one "## " heading, up to the next one. */
function section(dir: string, heading: string): string {
  const parts = handover(dir).split(/^## /m);
  const match = parts.find((part) => part.startsWith(`${heading}\n`));
  return match ?? "";
}

/** A score from an eval file: "passed" (or "score") and "total", or counted from "tasks". */
function scoreFrom(dir: string, file: string): Score | undefined {
  const path = join(dir, "evals", file);
  if (!existsSync(path)) return undefined;
  const results = JSON.parse(readFileSync(path, "utf8")) as EvalFile;
  const tasks = results.tasks ?? [];
  const passedTasks = tasks.filter((task) => task.pass === true);
  const passed = results.passed ?? results.score ?? passedTasks.length;
  const total = results.total ?? tasks.length;
  return { passed, total };
}

/** True when the text says the score as "9/20" or "9 of 20". */
function mentionsScore(text: string, score: Score): boolean {
  const pattern = new RegExp(`\\b${score.passed}\\s*(/|of|out of)\\s*${score.total}\\b`);
  return pattern.test(text);
}

let finishedTools: Promise<ToolInfo[]> | undefined;

/** Every tool the finished server lists for Joon, the director, who may use them all. */
function toolsOfFinishedServer(): Promise<ToolInfo[]> {
  finishedTools ??= (async () => {
    const connection = await connectFinished({ as: "joon" });
    try {
      const { tools } = await connection.client.listTools();
      return tools.map((tool) => ({
        name: tool.name,
        readOnly: tool.annotations?.readOnlyHint === true,
        destructive: tool.annotations?.destructiveHint === true,
      }));
    } finally {
      await connection.close();
    }
  })();
  return finishedTools;
}

/** The line in the Tools section that names this tool. */
function lineFor(dir: string, toolName: string): string {
  const lines = section(dir, "Tools").split("\n");
  return lines.find((line) => line.includes(toolName)) ?? "";
}

function markedAsAnnotated(dir: string, tool: ToolInfo): boolean {
  const line = lineFor(dir, tool.name).toLowerCase();
  if (tool.readOnly) return line.includes("read-only");
  if (tool.destructive) return line.includes("destructive") && !line.includes("not destructive");
  return !line.includes("read-only") && line.includes("not destructive");
}

let missingTools = "";

export default [
  rule(
    "HANDOVER.md has the six sections, and no TODO is left",
    async (dir) => {
      const text = handover(dir);
      const hasEverySection = SECTIONS.every((heading) => section(dir, heading).length > 0);
      return hasEverySection && !text.includes("TODO");
    },
    `keep the six headings: ${SECTIONS.join(", ")}. Replace every TODO with your own words`,
  ),
  rule(
    "The Tools section names every tool from tools/list",
    async (dir) => {
      const tools = await toolsOfFinishedServer();
      const missing = tools.filter((tool) => !lineFor(dir, tool.name));
      missingTools = missing.map((tool) => tool.name).join(", ");
      return missing.length === 0;
    },
    () => `give each tool its own line in the Tools section. Missing: ${missingTools}`,
  ),
  rule(
    "Each tool is marked read-only, writes or destructive, as its annotations say",
    async (dir) => {
      const tools = await toolsOfFinishedServer();
      return tools.every((tool) => markedAsAnnotated(dir, tool));
    },
    "read each tool's readOnlyHint and destructiveHint in world/finished/server.ts, " +
      'then write "Read-only", "Writes, not destructive" or "Destructive" on its line',
  ),
  rule(
    "The Scopes section names all four scopes",
    async (dir) => SCOPES.every((scope) => section(dir, "Scopes").includes(scope)),
    `name each scope in the Scopes table: ${SCOPES.join(", ")}`,
  ),
  rule(
    "The eval scores match evals/baseline.json and evals/designed.json",
    async (dir) => {
      const before = scoreFrom(dir, "baseline.json");
      const after = scoreFrom(dir, "designed.json");
      if (!before || !after) return false;
      const scores = section(dir, "Eval scores");
      return mentionsScore(scores, before) && mentionsScore(scores, after);
    },
    'copy the numbers from the JSON files, written like "9/20", never from memory',
  ),
  rule(
    "Threats and defences covers tool poisoning, prompt injection and a token for another server",
    async (dir) => {
      const threats = section(dir, "Threats and defences");
      return THREATS.every((threat) => threat.test(threats));
    },
    "write one line each for tool poisoning, prompt injection and a token for another server",
  ),
];
