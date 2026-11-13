// Start the Harrow Lane server: bun serve.ts
//
// TODO: a hosting platform tells your server which port to use in the PORT setting, and a
// container only accepts outside traffic on 0.0.0.0. Read PORT, and listen on 0.0.0.0.
import { app, publicUrl } from "./app";

Bun.serve({ hostname: "127.0.0.1", port: 8787, fetch: app.fetch });
console.log(`The Harrow Lane server is listening. Its public address is ${publicUrl.href}`);
