import { createApp } from "./app.js";
import { assertProductionConfiguration } from "./config.js";
import { closeDatabase, runMaintenance } from "./db.js";

assertProductionConfiguration();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const app = createApp();

try {
  console.log("Maintenance complete", runMaintenance());
} catch (error) {
  console.error("Startup maintenance failed", error);
}
const maintenanceTimer = setInterval(() => {
  try { runMaintenance(); } catch (error) { console.error("Scheduled maintenance failed", error); }
}, 15 * 60 * 1000);
maintenanceTimer.unref();

const server = app.listen(port, host, () => {
  console.log(`Qwen Image API listening on http://${host}:${port}`);
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(maintenanceTimer);
  console.log(`${signal} received; draining HTTP connections.`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  server.close((error) => {
    clearTimeout(forceExit);
    try { closeDatabase(); } catch (databaseError) { console.error(databaseError); }
    if (error) console.error(error);
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
