import { readFileSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";

export async function applySchema(pool: Pool): Promise<void> {
  const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await pool.query(sql);
}
