import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, getPool } from '../src/db/index';
try {
  await migrate(getDb(), { migrationsFolder: './drizzle' });
  console.log('Database migrations complete.');
} finally {
  await getPool().end();
}
