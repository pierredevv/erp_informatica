import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDir, '../..');

// En desarrollo se usa el .env de la raíz del workspace (mismo que Prisma y la
// API). En Vercel ese archivo no existe (está ignorado por Git) y las VITE_*
// llegan como variables de entorno del build.
const envDir = fs.existsSync(path.join(workspaceRoot, '.env')) ? workspaceRoot : appDir;

export default defineConfig({
  envDir,
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
