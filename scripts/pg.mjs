import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const dataDir = process.env.PGDATA || '/tmp/opencode/erp-postgres';
const port = Number(process.env.PGPORT || 55432);
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || 'password';
const database = process.env.PGDATABASE || 'erp_dev';
const command = process.argv[2] || 'start';

function createPg() {
  return new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user,
    password,
    persistent: true,
    autoRehydrateSymlinks: true,
    onLog: () => {},
    onError: (err) => console.error('[postgres]', err),
  });
}

async function main() {
  if (command === 'reset') {
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
    console.log(`Directorio eliminado: ${dataDir}`);
    return;
  }

  const alreadyRunning = await new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });

  if (command === 'start' && alreadyRunning) {
    console.log(`PostgreSQL ya está corriendo en postgresql://${user}:${password}@localhost:${port}/${database}`);
    return;
  }

  if (command === 'stop' && !alreadyRunning) {
    console.log('PostgreSQL no está corriendo.');
    return;
  }

  const pg = createPg();

  if (command === 'start') {
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    const needsInit = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
    if (needsInit) await pg.initialise();
    await pg.start();
    try {
      await pg.createDatabase(database);
    } catch {
      // Ya existe.
    }
    console.log(`PostgreSQL listo en postgresql://${user}:${password}@localhost:${port}/${database}`);
    return;
  }

  if (command === 'stop') {
    await pg.stop();
    console.log('PostgreSQL detenido.');
    return;
  }

  console.error('Uso: node scripts/pg.mjs start|stop|reset');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
