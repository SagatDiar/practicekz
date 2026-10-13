import fs from "node:fs/promises";
import http from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { initRealtime } from "./realtime.js";
import { UPLOAD_DIR } from "./utils/upload.js";

await fs.mkdir(UPLOAD_DIR, { recursive: true });
const server = http.createServer(app);
initRealtime(server);
server.listen(env.PORT, () => console.log(`API + Socket.IO: http://localhost:${env.PORT}`));
