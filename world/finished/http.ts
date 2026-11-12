// bun run finished: serve the finished Harrow Lane server on http://127.0.0.1:8787/mcp
// and print a demo token for each of the three demo staff.

import { clinic } from "#clinic";
import { DEMO, mintToken, PORT, RESOURCE } from "../auth";
import { app } from "./app";

Bun.serve({ hostname: "127.0.0.1", port: PORT, fetch: app.fetch });
console.log(`The finished Harrow Lane server is listening on ${RESOURCE}`);
for (const [shortName, staffId] of Object.entries(DEMO)) {
  const staffMember = clinic.staffMember(staffId);
  if (!staffMember) continue;
  const token = await mintToken({
    staffId: staffMember.id,
    role: staffMember.role,
    site: staffMember.site,
  });
  const who = `${staffMember.name} (${staffMember.role}, ${staffMember.site})`;
  console.log(`\n${who}. Token for "${shortName}":\n${token}`);
}
console.log("\nPress Ctrl+C to stop.");
