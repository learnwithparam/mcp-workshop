// bun assignment/check.ts: runs every Done when line against your config.yaml and writes
// assignment/result.json. The grader runs this same file.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ASSIGNMENT_DIR, imageVersion } from "../checks/lib/gateway";
import rules from "../checks/put-servers-behind-agentgateway";

const results: Record<string, "pass" | "fail"> = {};
for (const rule of rules) {
  let ok = false;
  try {
    ok = await rule.test(ASSIGNMENT_DIR);
  } catch {
    ok = false;
  }
  results[rule.says] = ok ? "pass" : "fail";
  console.log(`${ok ? "PASS" : "FAIL"}  ${rule.says}`);
  if (!ok) console.log(`      Try next: ${rule.tryNext}`);
}
const version = await imageVersion().catch(() => "unknown");
const everyLinePasses = Object.values(results).every((result) => result === "pass");
const report = { gatewayVersion: version, results, passed: everyLinePasses };
writeFileSync(join(ASSIGNMENT_DIR, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(everyLinePasses ? "Done. Every line passes." : "Some lines fail. See result.json.");
process.exit(everyLinePasses ? 0 : 1);
