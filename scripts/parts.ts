// Builds PARTS.md from the folders in parts/ and the minutes in each step's step.toml.
// Run `bun run parts` to write PARTS.md. Run `bun run parts --check` to fail when it is stale.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const partsRoot = join(repoRoot, "parts");
const partsFile = join(repoRoot, "PARTS.md");

const INTRO = [
  "This file is made from the folders in `parts/` and the minutes in each step's `step.toml`.",
  "Run `bun run parts` after you add or change a step.",
  "`bun run check` fails when this file is out of date.",
].join(" ");

type Step = { part: string; name: string; link: string; minutes: number; edits: string[] };
type Column = { title: string; rightAligned: boolean };

const PART_COLUMNS: Column[] = [
  { title: "Part", rightAligned: false },
  { title: "Folder", rightAligned: false },
  { title: "Steps", rightAligned: true },
  { title: "Minutes", rightAligned: true },
];

const STEP_COLUMNS: Column[] = [
  { title: "Part", rightAligned: false },
  { title: "Step", rightAligned: false },
  { title: "Minutes", rightAligned: true },
  { title: "Files to edit", rightAligned: false },
];

const isFolder = (path: string) => statSync(path).isDirectory();
const foldersIn = (dir: string) =>
  readdirSync(dir)
    .filter((name) => isFolder(join(dir, name)))
    .sort();
const withoutNumber = (folder: string) => folder.replace(/^\d\d-/, "");

function titleOf(readmePath: string): string {
  const titleLine = readFileSync(readmePath, "utf8")
    .split("\n")
    .find((line) => line.startsWith("# "));
  if (titleLine === undefined) throw new Error(`${readmePath} has no # title`);
  return titleLine.slice(2).trim();
}

function minutesOf(stepDir: string): number {
  const toml = readFileSync(join(stepDir, "step.toml"), "utf8");
  const match = toml.match(/^minutes = (\d+)/m);
  if (match === null) throw new Error(`${stepDir}/step.toml has no minutes`);
  return Number(match[1]);
}

function filesToEdit(problemDir: string): string[] {
  return readdirSync(problemDir)
    .filter((name) => name !== "README.md" && name !== ".gitkeep")
    .sort()
    .map((name) => (isFolder(join(problemDir, name)) ? `${name}/` : name));
}

function stepsIn(partFolder: string): Step[] {
  const partDir = join(partsRoot, partFolder);
  const stepFolders = foldersIn(partDir).filter((folder) =>
    existsSync(join(partDir, folder, "step.toml")),
  );
  return stepFolders.map((stepFolder) => {
    const stepDir = join(partDir, stepFolder);
    const problemDir = join(stepDir, "problem");
    if (!existsSync(join(problemDir, "README.md"))) {
      throw new Error(`${stepDir} has no problem/README.md`);
    }
    return {
      part: withoutNumber(partFolder),
      name: withoutNumber(stepFolder),
      link: `parts/${partFolder}/${stepFolder}/problem/README.md`,
      minutes: minutesOf(stepDir),
      edits: filesToEdit(problemDir),
    };
  });
}

function padCell(text: string, width: number, rightAligned: boolean): string {
  return rightAligned ? text.padStart(width) : text.padEnd(width);
}

// A Markdown table with every column padded to the same width, the way Biome formats it.
function tableOf(columns: Column[], rows: string[][]): string[] {
  const widths = columns.map((column, index) =>
    Math.max(column.title.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells: string[]) => {
    const padded = cells.map((cell, index) =>
      padCell(cell, widths[index], columns[index].rightAligned),
    );
    return `| ${padded.join(" | ")} |`;
  };
  const rule = columns.map((column, index) =>
    column.rightAligned ? `${"-".repeat(widths[index] - 1)}:` : "-".repeat(widths[index]),
  );
  return [
    line(columns.map((column) => column.title)),
    `| ${rule.join(" | ")} |`,
    ...rows.map(line),
  ];
}

function partRow(partFolder: string, steps: Step[]): string[] {
  const title = titleOf(join(partsRoot, partFolder, "README.md"));
  const minutes = steps.reduce((total, step) => total + step.minutes, 0);
  return [
    `[${title}](parts/${partFolder}/README.md)`,
    `\`${withoutNumber(partFolder)}\``,
    String(steps.length),
    String(minutes),
  ];
}

function stepRow(step: Step): string[] {
  const edits = step.edits.length > 0 ? step.edits.map((name) => `\`${name}\``).join(", ") : "none";
  return [`\`${step.part}\``, `[\`${step.name}\`](${step.link})`, String(step.minutes), edits];
}

function render(): string {
  const partEntries = foldersIn(partsRoot).map((partFolder) => ({
    partFolder,
    steps: stepsIn(partFolder),
  }));
  const allSteps = partEntries.flatMap((entry) => entry.steps);
  const totalMinutes = allSteps.reduce((total, step) => total + step.minutes, 0);
  const partRows = partEntries.map((entry) => partRow(entry.partFolder, entry.steps));
  partRows.push(["**Total**", "", String(allSteps.length), String(totalMinutes)]);
  return [
    "# Parts",
    "",
    INTRO,
    "",
    "## Parts",
    "",
    ...tableOf(PART_COLUMNS, partRows),
    "",
    "## Steps",
    "",
    ...tableOf(STEP_COLUMNS, allSteps.map(stepRow)),
    "",
  ].join("\n");
}

const expected = render();
if (process.argv.includes("--check")) {
  const actual = existsSync(partsFile) ? readFileSync(partsFile, "utf8") : "";
  if (actual !== expected) {
    console.error("PARTS.md is out of date. Run: bun run parts");
    process.exit(1);
  }
  console.log("PARTS.md matches the parts folders.");
} else {
  writeFileSync(partsFile, expected);
  console.log("Wrote PARTS.md");
}
