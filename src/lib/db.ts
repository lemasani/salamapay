import { Pool, types, type PoolClient } from "pg";

// bigint (int8) columns hold TZS amounts and counts; they fit safely in a JS number.
types.setTypeParser(20, (v) => parseInt(v, 10));

const g = globalThis as unknown as { __salamaPool?: Pool };

export function getPool(): Pool {
  if (!g.__salamaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example)");
    g.__salamaPool = new Pool({ connectionString, max: 10 });
  }
  return g.__salamaPool;
}

export type Db = Pick<PoolClient, "query">;

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
