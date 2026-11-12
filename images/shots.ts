// bun run shots: run the real commands, render their output as a dark terminal page, and
// screenshot it. Uses the Playwright Chromium on this machine (install it with:
// bunx playwright install chromium).
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
type Shot = { out: string; title: string; commands: string[] };
type Job = { html: string; png: string };

const SHOTS: Shot[] = [
  {
    out: "images/finished-system.png",
    title: "The finished system",
    commands: [
      'bun run ask "Can Biscuit get her booster at Millbrook?"',
      'bun run ask "Show me Biscuit\'s clinical notes."',
    ],
  },
  {
    out: "00-orientation/images/first-run.png",
    title: "First run",
    commands: ["bun run world", "bun run verify meet-the-clinic"],
  },
  {
    out: "parts/00-start-here/01-meet-the-clinic/images/expected.png",
    title: "meet-the-clinic",
    commands: ['bun run ask "Can Biscuit get her booster at Millbrook?"'],
  },
  {
    out: "parts/01-give-the-diary/01-expose-the-diary/images/expected.png",
    title: "expose-the-diary",
    commands: [
      'bun run try find_free_slots \'{"site":"millbrook"}\' ' +
        "--server parts/01-give-the-diary/01-expose-the-diary/solution",
    ],
  },
];

// Each line is one CSS rule group. The page is built from these exact lines.
const STYLE_LINES = [
  "    body{margin:0;background:#0d1117;" +
    "font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e6edf3}",
  "    .win{width:800px;box-sizing:border-box;background:#161b22;border:1px solid #30363d;" +
    "border-radius:8px;overflow:hidden}",
  "    .bar{background:#21262d;padding:8px 12px;color:#8b949e;font-size:12px}" +
    ".bar i{display:inline-block;width:10px;height:10px;border-radius:50%;" +
    "margin-right:6px;background:#484f58}",
  "    .term{padding:12px 16px;white-space:pre-wrap;word-break:break-word}" +
    ".cmd{color:#79c0ff}.prompt{color:#7ee787}",
  "    .ok{color:#3fb950;font-weight:bold}.bad{color:#f85149;font-weight:bold}" +
    ".dim{color:#8b949e}.tool{color:#d2a8ff}",
];

function escapeHtml(text: string): string {
  const withAmpersands = text.replace(/&/g, "&amp;");
  const withLessThan = withAmpersands.replace(/</g, "&lt;");
  return withLessThan.replace(/>/g, "&gt;");
}

/** Colours PASS, FAIL, Try next and tool lines the way a terminal would. */
function colour(line: string): string {
  let html = escapeHtml(line);
  html = html.replace(/^(\s*)(PASS)/, '$1<span class="ok">$2</span>');
  html = html.replace(/^(\s*)(FAIL)/, '$1<span class="bad">$2</span>');
  html = html.replace(/^(\s*)(Try next:)/, '$1<span class="dim">$2</span>');
  return html.replace(/^(\s*tool )/, '<span class="tool">$1</span>');
}

/** Runs one command and returns what it printed, without bun's own script banner lines. */
function runCommand(command: string): string {
  const result = Bun.spawnSync(["bash", "-c", command], {
    cwd: ROOT,
    // biome-ignore lint/style/useNamingConvention: environment variable names are upper case
    env: { ...process.env, LLM_PROVIDER: "replay", FORCE_COLOR: "0" },
  });
  const printed = result.stdout.toString() + result.stderr.toString();
  const lines = printed.split("\n");
  const kept = lines.filter((line) => !/^\$ bun |^error: script/.test(line));
  return kept.join("\n").trimEnd();
}

function commandHtml(command: string): string {
  const outputLines = runCommand(command).split("\n");
  const rows = outputLines.map((line) => `<div>${colour(line) || "&nbsp;"}</div>`);
  const prompt = `<div class="cmd"><span class="prompt">$</span> ${escapeHtml(command)}</div>`;
  return `${prompt}${rows.join("")}<div>&nbsp;</div>`;
}

function pageHtml(shot: Shot): string {
  const body = shot.commands.map(commandHtml).join("");
  const style = `<style>\n${STYLE_LINES.join("\n")}\n  </style>`;
  const bar = `<div class="bar"><i></i><i></i><i></i> ${escapeHtml(shot.title)}</div>`;
  const window = `<div class="win">${bar}<div class="term">${body}</div></div>`;
  return `<!doctype html><meta charset="utf-8">${style}${window}`;
}

function resetWorld() {
  Bun.spawnSync([process.execPath, "world/cli.ts", "reset"], { cwd: ROOT });
}

resetWorld();
const jobs: Job[] = [];
for (const shot of SHOTS) {
  const htmlPath = join(tmpdir(), `shot-${jobs.length}.html`);
  writeFileSync(htmlPath, pageHtml(shot));
  mkdirSync(dirname(join(ROOT, shot.out)), { recursive: true });
  jobs.push({ html: htmlPath, png: join(ROOT, shot.out) });
}
resetWorld();

// Playwright runs under node, so the screenshot code is handed to node as a script.
const script = [
  "const { chromium } = require('playwright');",
  "(async () => {",
  "  const browser = await chromium.launch();",
  "  const viewport = { width: 832, height: 400 };",
  "  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });",
  `  for (const job of ${JSON.stringify(jobs)}) {`,
  "    await page.goto('file://' + job.html);",
  "    await page.locator('.win').screenshot({ path: job.png });",
  "    console.log('Saved ' + job.png);",
  "  }",
  "  await browser.close();",
  "})().catch((error) => { console.error(error.message); process.exit(1); });",
].join("\n");
const browserRun = Bun.spawnSync(["node", "-e", script], { stdout: "inherit", stderr: "inherit" });
if (browserRun.exitCode !== 0)
  console.log("The browser could not run. List each picture in images/SHOTS.md instead.");
