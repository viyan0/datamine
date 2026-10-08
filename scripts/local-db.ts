import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { mkdir } from 'node:fs/promises';
await mkdir('./.local', { recursive: true });
const db = await PGlite.create(process.env.LOCAL_DB_PATH || './.local/postgres');
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 54329, maxConnections: 10 });
await server.start();
console.log(
  'Local test PostgreSQL ready on 127.0.0.1:54329. Never use this development server for production.',
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
