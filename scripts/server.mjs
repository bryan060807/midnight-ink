import { createServer, request as httpRequest } from "node:http";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import nextEnv from "@next/env";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
class RuntimeConfigurationError extends Error {}

/** Only a bare interface address/hostname is accepted, never a URL or authority. */
export function validateHost(value, { production = false } = {}) {
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > 253)
    throw new RuntimeConfigurationError("HOST must be a bare interface address or hostname.");
  const hostname = /^(?=.{1,253}$)[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)*$/i;
  const ipVersion = isIP(value);
  if (!ipVersion && (!hostname.test(value) || /^[\d.]+$/.test(value) || /^0x[\da-f]+$/i.test(value)))
    throw new RuntimeConfigurationError("HOST must be a bare interface address or hostname.");
  const normalized = ipVersion === 6 ? new URL(`http://[${value}]`).hostname : value;
  if (production && ["0.0.0.0", "[::]", "[::ffff:0:0]"].includes(normalized))
    throw new RuntimeConfigurationError("Production HOST must select a verified interface instead of every interface.");
  return value;
}

/** Kept pure so CLI validation can be checked without starting Next.js. */
export function resolveRuntimeConfig(env = process.env, args = [], directory = projectDirectory) {
  let dev = false, host = env.HOST, port = env.PORT || "3031";
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--dev") dev = true;
    else if (argument === "--port" || argument === "-p") port = args[++index];
    else if (argument === "--hostname" || argument === "-H") {
      host = args[++index];
      if (!host) throw new RuntimeConfigurationError("HOST must be a bare interface address or hostname.");
    }
    else throw new RuntimeConfigurationError("Unknown server option. Use --dev, --port, or --hostname.");
  }
  if (!dev && !host) throw new RuntimeConfigurationError("Set HOST to the verified Windows interface before production startup.");
  host = validateHost(host || "127.0.0.1", { production: !dev });
  if (typeof port !== "string" || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new RuntimeConfigurationError("PORT must be an integer from 1 to 65535.");
  if (!env.DATABASE_URL?.trim()) throw new RuntimeConfigurationError("DATABASE_URL is required; configure PostgreSQL before startup.");
  if (!dev && env.NODE_ENV && env.NODE_ENV !== "production")
    throw new RuntimeConfigurationError("Production startup requires NODE_ENV=production.");
  if (dev && env.NODE_ENV === "production")
    throw new RuntimeConfigurationError("Development startup cannot use NODE_ENV=production.");
  if (!dev) {
    if (!env.MIDNIGHT_INK_DATA_DIR || !path.isAbsolute(env.MIDNIGHT_INK_DATA_DIR))
      throw new RuntimeConfigurationError("Production MIDNIGHT_INK_DATA_DIR must be an absolute persistent directory.");
    const relative = path.relative(path.resolve(directory), path.resolve(env.MIDNIGHT_INK_DATA_DIR));
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)))
      throw new RuntimeConfigurationError("Production MIDNIGHT_INK_DATA_DIR must be outside the checkout.");
  }
  return { dev, hostname: host, port: Number(port), dir: directory };
}

/** Probe the actual listener without the session's HTTP proxy or any provider login. */
export function verifyReadiness(config, env = process.env) {
  return new Promise((resolve, reject) => {
    const failure = () => reject(new RuntimeConfigurationError("Midnight Ink readiness failed. Configure PostgreSQL/authentication and run the explicit migrations before starting."));
    let authority;
    try {
      authority = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).host : `${isIP(config.hostname) === 6 ? `[${config.hostname}]` : config.hostname}:${config.port}`;
    } catch { failure(); return; }
    const request = httpRequest({
      hostname: config.hostname, port: config.port, path: "/api/health", method: "GET",
      headers: { Host: authority }, timeout: 60_000,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 16_384) { response.destroy(); failure(); }
      });
      response.on("error", failure);
      response.on("end", () => {
        try {
          const health = JSON.parse(body);
          if (response.statusCode !== 200 || health.status !== "ok" || health.database !== "postgresql" || health.schema !== "current") return failure();
          resolve();
        } catch { failure(); }
      });
    });
    request.on("timeout", () => { request.destroy(); failure(); });
    request.on("error", failure);
    request.end();
  });
}

export async function startServer(args = process.argv.slice(2)) {
  const dev = args.includes("--dev");
  process.env.NODE_ENV ||= dev ? "development" : "production";
  nextEnv.loadEnvConfig(projectDirectory, dev);
  const config = resolveRuntimeConfig(process.env, args);
  const { default: next } = await import("next");
  const app = next(config);
  await app.prepare();
  const handle = app.getRequestHandler();
  const sockets = new Set();
  const server = createServer((request, response) => {
    Promise.resolve(handle(request, response)).catch(() => {
      // Request URLs can contain OIDC codes. Never print URLs, headers, or errors here.
      if (!response.headersSent) response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("The application could not complete this request.");
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("upgrade", app.getUpgradeHandler());
  let stopping;
  const shutdown = () => {
    if (stopping) return stopping;
    stopping = (async () => {
      const deadline = setTimeout(() => {
        for (const socket of sockets) socket.destroy();
        console.error("Midnight Ink shutdown deadline reached.");
        process.exit(1);
      }, 15_000);
      deadline.unref();
      try {
        // Stop accepting connections, then drain active requests before ending database work.
        await new Promise((resolve) => {
          server.close(resolve);
          server.closeIdleConnections();
          // Development HMR upgrades otherwise keep server.close waiting indefinitely.
          if (config.dev) for (const socket of sockets) socket.destroy();
        });
        try { await app.close(); }
        finally {
          const closeDatabase = globalThis[Symbol.for("midnight-ink.database.shutdown")];
          if (typeof closeDatabase === "function") await closeDatabase();
        }
      } finally {
        clearTimeout(deadline);
      }
    })();
    return stopping;
  };
  const stop = () => {
    void shutdown().then(() => process.exit(0), () => {
      console.error("Midnight Ink could not finish shutdown cleanly.");
      process.exit(1);
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.on("message", (message) => { if (message === "shutdown") stop(); });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.hostname, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
  } catch (error) {
    await app.close();
    if (error?.code === "EADDRINUSE") throw new RuntimeConfigurationError("The configured application port is already in use. Check the existing midnight-ink process before restarting.");
    throw new RuntimeConfigurationError("Midnight Ink could not bind the configured interface and port.");
  }
  try { await verifyReadiness(config); }
  catch (error) { await shutdown(); throw error; }
  // This verifies database/schema and auth configuration, not a real provider registration/login.
  if (typeof process.send === "function") process.send("ready");
  console.info(`Midnight Ink ${config.dev ? "development" : "production"} listener ready on ${config.hostname}:${config.port}.`);
  return { server, app, shutdown };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServer().catch((error) => {
    // Only our fixed validation messages are safe to display; framework errors may contain secrets.
    console.error(error instanceof RuntimeConfigurationError ? error.message : "Midnight Ink startup failed. Verify protected server configuration and the production build.");
    process.exit(1);
  });
}
