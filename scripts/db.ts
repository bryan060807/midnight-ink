import nextEnv from "@next/env";
import { rmSync } from "node:fs";
import { getDatabase, dataDirectory } from "../src/lib/db";
import { getRequiredAuthConfig } from "../src/lib/auth-config";
nextEnv.loadEnvConfig(process.cwd());
if (process.env.NODE_ENV === "production") getRequiredAuthConfig();
if (process.argv.includes("--reset") || process.argv.includes("reset")) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Database reset is forbidden in production.");
  if (!process.argv.includes("--confirm-local-reset"))
    throw new Error(
      "Add --confirm-local-reset to delete the local development database.",
    );
  // Reset is intentionally limited to the default application data directory.
  if (process.env.DATABASE_PATH || process.env.MIDNIGHT_INK_DATA_DIR)
    throw new Error("Unset custom data paths before reset.");
  rmSync(dataDirectory(), { recursive: true, force: true });
}
const db = getDatabase();
console.log("Database migrations and idempotent content seed complete.");
console.log(
  `Lessons: ${db.prepare("SELECT COUNT(*) AS n FROM Lesson").get()?.n}`,
);
db.close();
