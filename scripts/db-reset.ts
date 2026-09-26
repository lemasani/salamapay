import { getPool } from "@/lib/db";
import { resetDatabase } from "@/lib/data/seed";

async function main() {
  const pool = getPool();
  await resetDatabase(pool);
  const { rows } = await pool.query("SELECT status, count(*) FROM transactions GROUP BY status ORDER BY status");
  console.log("Database reset with synthetic demo data:");
  console.table(rows);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
