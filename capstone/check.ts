// The capstone check: bun capstone/check.ts <your-folder>
// It reads only the folder you give it: my-api.json, server.ts and EVIDENCE.md.
// It runs the same rules as the wrap-your-own-api step, so a pass here means the step passes too.
import { resolve } from "node:path";
import rules from "../checks/wrap-your-own-api";

const folder = process.argv[2];
if (!folder) {
  console.error(
    "Give the folder with your capstone work, for example: bun capstone/check.ts my-work",
  );
  process.exit(2);
}
const artefact = resolve(folder);
let failures = 0;
for (const item of rules) {
  let holds = false;
  try {
    holds = await item.test(artefact);
  } catch {
    holds = false;
  }
  if (!holds) {
    failures += 1;
    console.log(`FAIL ${item.says}\n  Try next: ${item.tryNext}`);
  }
}
if (failures === 0) console.log(`Done. All ${rules.length} capstone rules pass.`);
process.exit(failures === 0 ? 0 : 1);
