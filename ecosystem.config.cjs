/* eslint-disable @typescript-eslint/no-require-imports -- PM2 loads ecosystem files as CommonJS. */
const fs = require("node:fs");
const path = require("node:path");

// Load protected .env.production.local/.env.local if the existing PM2 mechanism does not
// already supply the environment. Existing process variables always take precedence.
require("@next/env").loadEnvConfig(__dirname, false);
if (!process.env.MIDNIGHT_INK_DATA_DIR || !path.isAbsolute(process.env.MIDNIGHT_INK_DATA_DIR)) {
  throw new Error("Set an absolute MIDNIGHT_INK_DATA_DIR outside the checkout before loading PM2 configuration.");
}
const relative = path.relative(__dirname, path.resolve(process.env.MIDNIGHT_INK_DATA_DIR));
if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
  throw new Error("MIDNIGHT_INK_DATA_DIR must be outside the checkout.");
}
const logs = path.join(process.env.MIDNIGHT_INK_DATA_DIR, "logs");
fs.mkdirSync(logs, { recursive: true });

module.exports = {
  apps: [{
    name: "midnight-ink",
    cwd: __dirname,
    script: path.join(__dirname, "scripts", "server.mjs"),
    interpreter: process.execPath,
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    restart_delay: 3000,
    min_uptime: "10s",
    max_restarts: 5,
    wait_ready: true,
    listen_timeout: 120_000,
    shutdown_with_message: true,
    kill_timeout: 20_000,
    out_file: path.join(logs, "midnight-ink-out.log"),
    error_file: path.join(logs, "midnight-ink-error.log"),
    merge_logs: true,
    time: true,
    env: { NODE_ENV: "production", LOCAL_DEMO_ENABLED: "false", PORT: process.env.PORT || "3031" },
  }],
};
