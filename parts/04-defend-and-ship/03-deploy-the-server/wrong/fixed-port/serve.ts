// Start the Harrow Lane server: bun serve.ts
import { app, publicUrl } from "./app";

Bun.serve({ hostname: "0.0.0.0", port: 8787, fetch: app.fetch });
console.log(`The Harrow Lane server is listening on port 8787.`);
console.log(`Its public address is ${publicUrl.href}`);
