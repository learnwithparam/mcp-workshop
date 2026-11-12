// bun run finished: serve the finished Harrow Lane server on http://127.0.0.1:8787/mcp and print demo tokens.

import { clinic } from "#clinic";
import { DEMO, mintToken, PORT, RESOURCE } from "../auth";
import { app } from "./app";

Bun.serve({ hostname: "127.0.0.1", port: PORT, fetch: app.fetch });
console.log(`The finished Harrow Lane server is listening on ${RESOURCE}`);
for (const [short, id] of Object.entries(DEMO)) {
  const s = clinic.staffMember(id)!;
  console.log(
    `\n${s.name} (${s.role}, ${s.site}). Token for "${short}":\n${await mintToken({ staffId: s.id, role: s.role, site: s.site })}`,
  );
}
console.log("\nPress Ctrl+C to stop.");
