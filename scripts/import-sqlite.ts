/** Explicit operator command; never invoked by application startup or migrations. */
import nextEnv from "@next/env";
import { closeSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { closeDatabase, getDatabase } from "../src/lib/db";
import {
  importSqliteToPostgres,
  SqliteImportError,
  IMPORT_CONFIRMATION,
} from "../src/lib/sqlite-import";
nextEnv.loadEnvConfig(process.cwd());
const accepted = new Set([
  "source",
  "backup",
  "photos-dir",
  "confirm",
  "report",
]);
const args = new Map<string, string>();
let reportDescriptor: number | undefined;
let successful = false;
try {
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index]?.replace(/^--/, "");
    const value = process.argv[index + 1];
    if (
      !process.argv[index]?.startsWith("--") ||
      !accepted.has(key) ||
      !value ||
      value.startsWith("--") ||
      args.has(key)
    )
      throw new SqliteImportError(
        "CONFIRMATION_REQUIRED",
        "Use explicit --source, --backup, --photos-dir, --confirm and optional --report arguments.",
      );
    args.set(key, value);
  }
  for (const key of ["source", "backup", "photos-dir", "confirm"])
    if (!args.get(key))
      throw new SqliteImportError(
        "CONFIRMATION_REQUIRED",
        `Missing --${key}. Required confirmation: ${IMPORT_CONFIRMATION}.`,
      );
  // Reserve a new report before touching PostgreSQL. Never overwrite an old
  // report or discover a bad output path after a successful committed import.
  if (args.get("report")) {
    try {
      reportDescriptor = openSync(args.get("report")!, "wx", 0o600);
    } catch {
      throw new SqliteImportError(
        "CONFIRMATION_REQUIRED",
        "The report path must be new and writable before an import starts.",
      );
    }
  }
  const report = await importSqliteToPostgres({
    sourcePath: args.get("source")!,
    backupPath: args.get("backup")!,
    photosDirectory: args.get("photos-dir")!,
    confirmation: args.get("confirm")!,
    database: getDatabase(),
  });
  successful = true;
  const output = JSON.stringify(report, null, 2) + "\n";
  if (reportDescriptor !== undefined) writeFileSync(reportDescriptor, output);
  console.log(output);
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      code: error instanceof SqliteImportError ? error.code : "IMPORT_FAILED",
      error:
        error instanceof SqliteImportError
          ? error.message
          : successful
            ? "The PostgreSQL import committed, but its local report could not be written. Do not retry into this occupied destination; inspect the committed row counts."
            : "The operator import could not complete. No connection details or record contents are displayed.",
    }),
  );
  process.exitCode = 1;
} finally {
  if (reportDescriptor !== undefined) {
    closeSync(reportDescriptor);
    if (!successful)
      try {
        unlinkSync(args.get("report")!);
      } catch {}
  }
  await closeDatabase();
}
