// bun assignment/token.ts: makes a fresh test key and tokens in assignment/.run/ for the gateway.
// The folder is ignored by git, so no key is ever committed. Run it again for a fresh set.
import { join } from "node:path";
import { ASSIGNMENT_DIR, writeRunFiles } from "../checks/lib/gateway";

const runDir = join(ASSIGNMENT_DIR, ".run");
await writeRunFiles(runDir);
console.log(`Wrote the test key and tokens to ${runDir}`);
console.log("Your caller token is in .run/caller.token. It works for one hour.");
