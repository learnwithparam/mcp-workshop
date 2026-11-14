// Start the Harrow Lane server: bun serve.ts
// The platform gives the port in PORT. In a container, 0.0.0.0 accepts traffic from outside it.
import { app, publicUrl } from "./app";

const port = Number(process.env.PORT ?? 8787);
Bun.serve({ hostname: "0.0.0.0", port, fetch: app.fetch });
console.log(`The Harrow Lane server is listening on port ${port}.`);
console.log(`Its public address is ${publicUrl.href}`);
