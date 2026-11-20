import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');

const sharedOptions = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

await Promise.all([
  esbuild.build({
    ...sharedOptions,
    entryPoints: [path.join(desktopDir, 'electron', 'main.ts')],
    outfile: path.join(desktopDir, 'dist-electron', 'main.js'),
  }),
  esbuild.build({
    ...sharedOptions,
    entryPoints: [path.join(desktopDir, 'electron', 'preload.ts')],
    outfile: path.join(desktopDir, 'dist-electron', 'preload.js'),
  }),
]);
