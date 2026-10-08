import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const globalDb = globalThis as unknown as { dataminePool?: Pool };
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  globalDb.dataminePool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
  });
  return globalDb.dataminePool;
}
export function getDb() {
  return drizzle(getPool(), { schema });
}
