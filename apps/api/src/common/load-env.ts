import fs from 'node:fs';
import path from 'node:path';

/**
 * Carga el primer `.env` disponible sin sobrescribir variables ya definidas
 * por el entorno (en producción el host puede inyectarlas directamente).
 *
 * Se busca desde el cwd porque pnpm --filter ejecuta la API desde `apps/api`,
 * mientras que un `node apps/api/dist/main.js` se ejecuta desde la raíz.
 */
for (const candidate of ['.env', '../.env', '../../.env']) {
  const file = path.resolve(process.cwd(), candidate);
  if (fs.existsSync(file)) {
    process.loadEnvFile(file);
    break;
  }
}
