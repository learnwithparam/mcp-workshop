// bun run shots: run the real commands, render their output as a dark terminal page, and screenshot it.
// Uses the Playwright Chromium on this machine (install it with: bunx playwright install chromium).
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SHOTS: { out: string; title: string; commands: string[] }[] = [
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
      'bun run try find_free_slots \'{"site":"millbrook"}\' --server parts/01-give-the-diary/01-expose-the-diary/solution',
    ],
  },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colour = (line: string) =>
  esc(line)
    .replace(/^(\s*)(PASS)/, '$1<span class="ok">$2</span>')
    .replace(/^(\s*)(FAIL)/, '$1<span class="bad">$2</span>')
    .replace(/^(\s*)(Try next:)/, '$1<span class="dim">$2</span>')
    .replace(/^(\s*tool )/, '<span class="tool">$1</span>');

Bun.spawnSync([process.execPath, "world/cli.ts", "reset"], { cwd: ROOT });
const jobs: { html: string; png: string }[] = [];
for (const s of SHOTS) {
  let body = "";
  for (const c of s.commands) {
    const r = Bun.spawnSync(["bash", "-c", c], {
      cwd: ROOT,
      env: { ...process.env, LLM_PROVIDER: "replay", FORCE_COLOR: "0" },
    });
    const out = (r.stdout.toString() + r.stderr.toString())
      .split("\n")
      .filter((l) => !/^\$ bun |^error: script/.test(l))
      .join("\n")
      .trimEnd();
    body += `<div class="cmd"><span class="prompt">$</span> ${esc(c)}</div>${out
      .split("\n")
      .map((l) => `<div>${colour(l) || "&nbsp;"}</div>`)
      .join("")}<div>&nbsp;</div>`;
  }
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#0d1117;font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e6edf3}
    .win{width:800px;box-sizing:border-box;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden}
    .bar{background:#21262d;padding:8px 12px;color:#8b949e;font-size:12px}.bar i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:#484f58}
    .term{padding:12px 16px;white-space:pre-wrap;word-break:break-word}.cmd{color:#79c0ff}.prompt{color:#7ee787}
    .ok{color:#3fb950;font-weight:bold}.bad{color:#f85149;font-weight:bold}.dim{color:#8b949e}.tool{color:#d2a8ff}
  </style><div class="win"><div class="bar"><i></i><i></i><i></i> ${esc(s.title)}</div><div class="term">${body}</div></div>`;
  const htmlPath = join(tmpdir(), `shot-${jobs.length}.html`);
  writeFileSync(htmlPath, html);
  mkdirSync(dirname(join(ROOT, s.out)), { recursive: true });
  jobs.push({ html: htmlPath, png: join(ROOT, s.out) });
}
Bun.spawnSync([process.execPath, "world/cli.ts", "reset"], { cwd: ROOT });

const script = `const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 832, height: 400 }, deviceScaleFactor: 2 });
for (const j of ${JSON.stringify(jobs)}) { await p.goto('file://' + j.html); await p.locator('.win').screenshot({ path: j.png }); console.log('Saved ' + j.png); }
await b.close(); })().catch((e) => { console.error(e.message); process.exit(1); });`;
const r = Bun.spawnSync(["node", "-e", script], { stdout: "inherit", stderr: "inherit" });
if (r.exitCode !== 0)
  console.log("The browser could not run. List each picture in images/SHOTS.md instead.");
