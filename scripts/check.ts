// bun run check: the repo standard. CI runs this; any failure stops the build.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { allSteps, type Part, parts, ROOT, type Step } from "./structure";

const errors: string[] = [];
const fail = (where: string, what: string) => {
  errors.push(`${relative(ROOT, where) || "."}: ${what}`);
};
const read = (path: string) => readFileSync(path, "utf8");

const STEP_SECTIONS = [
  "## The problem",
  "## Your challenge",
  "## Done when",
  "## If you get stuck",
  "## Words you will use",
];
const HYPE = new RegExp(
  [
    "\\b(supercharge|unleash|unlock|seamless(ly)?|leverage|dive into|game[- ]changer",
    "|revolutioni[sz]e|magic(al)?|cutting[- ]edge|AI-powered)\\b",
  ].join(""),
  "i",
);
const TIME_WORDS = /\b(week|day|hour)\s+\d+\b/i;
const VERB_THING = /^[a-z]+(-[a-z0-9]+)+$/;
const IMAGE = /!\[[^\]]*\]\(([^)\s]+)\)/g;
const MERMAID = /```mermaid\n/;
const MODEL_ID = /\b(claude-[a-z0-9-]+-\d|gpt-\d[\w.-]*|gemini-\d[\w.-]*|o\d-(mini|pro)\b)/i;

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}
const files = walk(ROOT);
const markdownFiles = files.filter((file) => file.endsWith(".md"));
const hasImage = (text: string) => [...text.matchAll(IMAGE)].length > 0;

// 1. No Makefile anywhere.
function checkNoMakefiles() {
  for (const file of files)
    if (/(^|\/)(GNU)?[Mm]akefile$/.test(file))
      fail(file, "a Makefile is not allowed; use a Bun or uv script");
}

// 2. Prose rules on every Markdown file.
function checkProseLine(file: string, line: string, i: number) {
  if (line.includes("—")) fail(file, `line ${i + 1}: em dash`);
  const hype = line.match(HYPE);
  if (hype) fail(file, `line ${i + 1}: hype word "${hype[0]}"`);
  const timeWord = line.match(TIME_WORDS);
  if (timeWord && !file.includes("schedules"))
    fail(file, `line ${i + 1}: "${timeWord[0]}"; content is in parts, schedules map time`);
  if (/\bM=\d+|verify \d+/.test(line))
    fail(file, `line ${i + 1}: numeric step command; name the step`);
}

function checkProse() {
  for (const file of markdownFiles) {
    const lines = read(file).split("\n");
    lines.forEach((line, i) => {
      checkProseLine(file, line, i);
    });
  }
}

// 2b. Every page shows, not only tells: images it names exist, and the key pages carry a picture.
function checkImagesExist() {
  for (const file of markdownFiles) {
    for (const image of read(file).matchAll(IMAGE)) {
      const target = image[1];
      if (/^https?:/.test(target)) continue;
      if (!existsSync(join(dirname(file), target))) fail(file, `image "${target}" does not exist`);
    }
  }
}

type PictureNeed = { file: string; what: string; mermaid: boolean; image: boolean };

function needPicture({ file, what, mermaid, image }: PictureNeed) {
  if (!existsSync(file)) return fail(file, "missing");
  const text = read(file);
  if (mermaid && !MERMAID.test(text)) fail(file, `${what} needs a Mermaid diagram`);
  if (image && !hasImage(text)) fail(file, `${what} needs a screenshot`);
}

function checkKeyPictures() {
  const rootReadme = join(ROOT, "README.md");
  needPicture({ file: rootReadme, what: "the root README", mermaid: true, image: true });
  const orientation = join(ROOT, "00-orientation", "README.md");
  needPicture({ file: orientation, what: "the orientation", mermaid: false, image: true });
}

// 3. Parts and steps.
function checkPartReadme(readme: string) {
  const text = read(readme);
  if (!MERMAID.test(text)) fail(readme, "part README needs a Mermaid diagram");
  const walkthrough = text.split("## Walkthrough")[1]?.split("\n## ")[0];
  if (walkthrough === undefined) fail(readme, `part README needs a "## Walkthrough" section`);
  else if (!walkthrough.includes("```bash"))
    fail(readme, "the walkthrough needs the commands, each with an Expect: line");
}

/** Checks one part. Returns true when it is a skeleton part. */
function checkPart(part: Part, seenNames: Set<string>): boolean {
  const readme = join(part.dir, "README.md");
  if (!existsSync(readme)) fail(part.dir, "part has no README.md");
  else checkPartReadme(readme);
  // A skeleton part waits for its own build session: README only, marked TODO(part session),
  // with its steps named in PARTS.md.
  const skeleton = existsSync(readme) && read(readme).includes("TODO(part session)");
  if (part.steps.length === 0 && !skeleton) fail(part.dir, "part has no steps");
  if (part.steps.length > 0 && skeleton)
    fail(readme, "a part with steps must not keep TODO(part session)");
  for (const step of part.steps) checkStep(step, seenNames);
  return skeleton;
}

function checkStepNameAndMeta(step: Step, seenNames: Set<string>) {
  if (!VERB_THING.test(step.name))
    fail(step.dir, `step name "${step.name}" must be verb-thing in lower case`);
  if (seenNames.has(step.name)) fail(step.dir, `step name "${step.name}" is used twice`);
  seenNames.add(step.name);
  if (!existsSync(join(step.dir, "step.toml"))) fail(step.dir, "missing step.toml");
  const minutes = step.meta.minutes;
  if (minutes < 5 || minutes > 30)
    fail(step.dir, `step is ${minutes} min; keep a step between 5 and 30, split it if longer`);
}

function checkStep(step: Step, seenNames: Set<string>) {
  checkStepNameAndMeta(step, seenNames);
  const stepReadme = join(step.dir, "problem", "README.md");
  if (!existsSync(stepReadme)) {
    fail(step.dir, "missing problem/README.md");
    return;
  }
  checkStepReadme(step, stepReadme);
  if (step.meta.solution && !existsSync(join(step.dir, "solution")))
    fail(step.dir, "step.toml says solution but there is no solution/");
  const checksDir = join(ROOT, "checks");
  const hasCheck =
    existsSync(join(checksDir, `${step.name}.ts`)) ||
    existsSync(join(checksDir, `${step.name}.py`));
  if (!hasCheck) fail(step.dir, `no check at checks/${step.name}.ts`);
}

function checkStepReadme(step: Step, stepReadme: string) {
  const text = read(stepReadme);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 600)
    fail(stepReadme, `${words} words; a step README stays under 600, split the step`);
  for (const heading of STEP_SECTIONS)
    if (!text.includes(heading)) fail(stepReadme, `missing section "${heading}"`);
  if (!MERMAID.test(text) && !hasImage(text))
    fail(stepReadme, "a step shows a picture: a screenshot or a Mermaid diagram");
  const doneWhen = text.split("## Done when")[1]?.split("\n## ")[0] ?? "";
  if (!/^- /m.test(doneWhen)) fail(stepReadme, "Done when needs at least one bullet");
  if (step.meta.screen) checkScreenshot(step, stepReadme, text);
}

// A step that happens on screen shows the learner what they should see.
function checkScreenshot(step: Step, stepReadme: string, text: string) {
  if (!existsSync(join(step.dir, "images", "expected.png")))
    fail(step.dir, "screen step needs images/expected.png");
  if (!text.includes("images/expected.png"))
    fail(stepReadme, "screen step must show ../images/expected.png");
}

/** Checks every part and returns how many are skeletons. */
function checkParts(allParts: Part[]): number {
  if (allParts.length === 0) fail(join(ROOT, "parts"), "no parts");
  const seenNames = new Set<string>();
  let skeletons = 0;
  for (const part of allParts) if (checkPart(part, seenNames)) skeletons++;
  return skeletons;
}

// 4. Commands: the README runs the finished system first, and every command block says what to
// expect.
function checkRootReadmeRunsFirst() {
  const rootReadme = join(ROOT, "README.md");
  if (!existsSync(rootReadme)) return fail(ROOT, "missing README.md");
  const text = read(rootReadme);
  const firstCode = text.indexOf("```bash");
  const firstConcept = text.search(/^## (How it works|Concepts|Background|Why)/m);
  if (firstCode < 0)
    fail(rootReadme, "the README needs a bash block that runs the finished system");
  else if (firstConcept >= 0 && firstConcept < firstCode)
    fail(rootReadme, "run the finished system before any concept section");
}

function checkExpectLines(file: string) {
  const lines = read(file).split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "```bash") continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== "```") j++;
    const after = lines.slice(j + 1).find((line) => line.trim() !== "");
    if (!after?.startsWith("Expect:"))
      fail(file, `line ${i + 1}: a bash block must be followed by an Expect: line`);
    i = j;
  }
}

// 5. One model config, exact pins, a troubleshooting table.
function checkModelIdsInOnePlace() {
  const scanned = files.filter(
    (file) =>
      /\.(ts|py|md|json|toml|ya?ml)$/.test(file) &&
      !file.includes("/config/models.") &&
      !file.includes("/scripts/check.ts"),
  );
  for (const file of scanned) {
    const modelId = read(file).match(MODEL_ID);
    if (modelId)
      fail(file, `model id "${modelId[0]}" outside config/models; name models in one place`);
  }
}

function checkExactPins() {
  const packageJson = join(ROOT, "package.json");
  if (existsSync(packageJson)) {
    const manifest = JSON.parse(read(packageJson));
    const versions: Record<string, string> = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };
    for (const [name, version] of Object.entries(versions))
      if (!/^\d+\.\d+\.\d+$/.test(version))
        fail(packageJson, `${name}@${version}: pin an exact version`);
  }
  const pyproject = join(ROOT, "pyproject.toml");
  if (!existsSync(pyproject)) return;
  const looseRequirement = /"([A-Za-z0-9_.\-[\]]+)\s*(>=|~=|\^|>|<)[^"]*"/g;
  for (const loose of read(pyproject).matchAll(looseRequirement))
    fail(pyproject, `${loose[1]}: pin with == not ${loose[2]}`);
}

function checkTroubleshootingTable() {
  const trouble = join(ROOT, "00-orientation", "troubleshooting.md");
  const tableHeader = /\| *What you see *\| *What it means *\| *Fix *\|/;
  if (!existsSync(trouble) || !tableHeader.test(read(trouble)))
    fail(
      ROOT,
      "00-orientation/troubleshooting.md needs a table: What you see | What it means | Fix",
    );
}

// 6. Every schedule covers every part, and the minutes add up.
type Schedule = { sessions: { parts: string[]; minutes: number }[] };

function checkSchedules(allParts: Part[]) {
  const schedulePath = join(ROOT, "schedules.toml");
  if (!existsSync(schedulePath)) return fail(ROOT, "missing schedules.toml");
  const schedules = Bun.TOML.parse(read(schedulePath)) as Record<string, Schedule>;
  const partMinutes: Record<string, number> = Object.fromEntries(
    allParts.map((part) => [part.name, sumMinutes(part.steps)]),
  );
  for (const [format, schedule] of Object.entries(schedules))
    checkSchedule({ schedulePath, format, schedule, allParts, partMinutes });
}

type ScheduleCheck = {
  schedulePath: string;
  format: string;
  schedule: Schedule;
  allParts: Part[];
  partMinutes: Record<string, number>;
};

function checkSchedule({ schedulePath, format, schedule, allParts, partMinutes }: ScheduleCheck) {
  const listed = schedule.sessions.flatMap((session) => session.parts);
  for (const part of allParts)
    if (!listed.includes(part.name)) fail(schedulePath, `${format} leaves out part "${part.name}"`);
  for (const session of schedule.sessions) {
    const need = session.parts.reduce((total, name) => total + (partMinutes[name] ?? 0), 0);
    if (need > session.minutes)
      fail(schedulePath, `${format}: a session needs ${need} min but has ${session.minutes}`);
  }
}

const sumMinutes = (steps: Step[]) => steps.reduce((total, step) => total + step.meta.minutes, 0);

checkNoMakefiles();
checkProse();
checkImagesExist();
checkKeyPictures();
const allParts = parts();
const skeletons = checkParts(allParts);
checkRootReadmeRunsFirst();
for (const file of markdownFiles) checkExpectLines(file);
checkModelIdsInOnePlace();
checkExactPins();
checkTroubleshootingTable();
checkSchedules(allParts);

if (errors.length) {
  console.log(`The repo does not meet the standard. ${errors.length} problem(s):`);
  for (const error of errors) console.log(`  - ${error}`);
  process.exit(1);
}
const skeletonNote = skeletons ? `, ${skeletons} skeleton part(s) waiting for a part session` : "";
console.log(
  `The repo meets the standard: ${allParts.length} part(s), ${allSteps().length} step(s)` +
    `${skeletonNote}.`,
);
