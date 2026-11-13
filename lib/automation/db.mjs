import "server-only";
import pg from "pg";
import { setupError } from "./errors.mjs";
let pool;
export function databaseConfigured() { return /^(postgres|postgresql):\/\//.test(process.env.DATABASE_URL || ""); }
export function getDatabase() {
  if (!databaseConfigured()) throw setupError();
  if (!pool) {
    const url = new URL(process.env.DATABASE_URL);
    // pg-connection-string can otherwise override the explicit TLS policy via
    // sslmode=no-verify in a URL. Only DATABASE_SSL=disable permits local TLS off.
    for (const name of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl"]) url.searchParams.delete(name);
    pool = new pg.Pool({ connectionString: url.href, max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000, statement_timeout: 12000, ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: true } });
    pool.on("error", () => { /* A disconnected idle client is replaced; do not log connection secrets. */ });
  }
  return pool;
}
export async function transaction(database, task) {
  const client = await database.connect();
  try { await client.query("BEGIN"); const result = await task(client); await client.query("COMMIT"); return result; }
  catch (error) { try { await client.query("ROLLBACK"); } catch { /* Preserve the original error. */ } throw error; }
  finally { client.release(); }
}
export async function databaseHealth() {
  if (!databaseConfigured()) return { configured: false, ready: false, reason: "Database connection is missing" };
  try { const result = await getDatabase().query("SELECT version FROM pincraft_auto_schema WHERE version=2"); return { configured: true, ready: result.rowCount === 1, reason: result.rowCount ? null : "Apply the automation database migration" }; }
  catch { return { configured: true, ready: false, reason: "Database is unavailable or the migration has not been applied" }; }
}
