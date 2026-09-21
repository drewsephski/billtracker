import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";
let pool: Pool | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  if (!database) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
    });
    pool.on("error", () => console.error("Idle database connection failed."));
    if (process.env.VERCEL) attachDatabasePool(pool);
    database = drizzle(pool, { schema });
  }
  return database;
}
export type Database = ReturnType<typeof getDb>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export async function closeDb() {
  await pool?.end();
  pool = undefined;
  database = undefined;
}
