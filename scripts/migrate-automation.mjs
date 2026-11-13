import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getDatabase } from "../lib/automation/db.mjs";
const database = getDatabase();
try {
  for (const name of ['001_automation.sql','002_condition_one_oauth.sql']) {
    const sql = await readFile(fileURLToPath(new URL(`../db/migrations/${name}`, import.meta.url)), 'utf8');
    await database.query(sql);
  }
  console.log('Automation schema v2 applied. Legacy manual publishing credentials removed; OAuth consent is required. No accounts enabled and no sample successes inserted.');
} catch { console.error("Migration failed. Check PostgreSQL availability, TLS and migration permissions. Connection values were not logged."); process.exitCode = 1; }
finally { await database.end(); }
