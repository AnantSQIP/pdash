// Dev-only: runs an in-process Postgres (PGlite/WASM) over a TCP socket so
// Prisma and the API can talk to it on localhost:5432 with NO Postgres install.
// Used to smoke-test in sandboxes without Docker. Not for production.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.PGLITE_PORT ?? 5432);
const db = await PGlite.create({ dataDir: process.env.PGLITE_DIR ?? './.pglite-data' });

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
console.log(`PGlite TCP server listening on 127.0.0.1:${port}`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
