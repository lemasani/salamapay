import { Pool } from "pg";
import { applySchema } from "../src/lib/data/schema";

export default async function setup() {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await applySchema(pool);
  await pool.end();
}
