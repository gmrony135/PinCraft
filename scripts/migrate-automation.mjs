import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getDatabase } from "../lib/automation/db.mjs";
const database = getDatabase();
try {
  const sql = await readFile(fileURLToPath(new URL("../db/migrations/001_automation.sql", import.meta.url)), "utf8");
  await database.query(sql);
  console.log("Automation schema v1 applied. No accounts enabled and no sample successes inserted.");
} catch { console.error("Migration failed. Check PostgreSQL availability, TLS and migration permissions. Connection values were not logged."); process.exitCode = 1; }
finally { await database.end(); }
