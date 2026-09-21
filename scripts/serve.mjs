#!/usr/bin/env node
/**
 * Cross-platform PRODUCTION launcher for pdash / SquarkIP.
 * Works identically on Linux, WSL, macOS and Windows.
 *
 * Starts:
 *   - the built NestJS API   (apps/api/dist/main.js)  on API_PORT   (default 4000)
 *   - the Next.js prod server (next start)            on WEB_PORT   (default 3001)
 *
 * Prereq: run a production build first ->  npm run build:all
 * Usage:  node scripts/serve.mjs   (or: npm run serve)
 *
 * Why this exists: running `next dev` across the WSL<->Windows filesystem
 * boundary (/mnt/c, a 9p mount) makes every file read ~3000x slower. Running a
 * production build from a NATIVE filesystem (Linux ext4 home, or Windows NTFS
 * with Windows-native Node) is the permanent fix. This launcher is that runtime.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = process.env.API_PORT || '4000';
const WEB_PORT = process.env.WEB_PORT || '3001';
const API_ORIGIN = process.env.API_ORIGIN || `http://localhost:${API_PORT}`;
const isWin = process.platform === 'win32';

const apiEntry = join(root, 'apps', 'api', 'dist', 'main.js');
const webBuildId = join(root, 'apps', 'web', '.next', 'BUILD_ID');
if (!existsSync(apiEntry) || !existsSync(webBuildId)) {
  console.error('\n  Build not found. Run a production build first:\n    npm run build:all\n');
  process.exit(1);
}

const procs = [];
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) { try { p.kill(); } catch {} }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function launch(name, cmd, args, env) {
  const p = spawn(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin, // Windows needs shell:true to resolve npm/npm.cmd
    env: { ...process.env, ...env },
  });
  p.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`\n  [${name}] exited (code ${code}). Stopping the other process.`);
      shutdown(code ?? 1);
    }
  });
  procs.push(p);
}

// API — plain node on the compiled output (fast, no ts-node).
launch('api', process.execPath, [apiEntry], { API_PORT });
// Web — Next.js production server via the workspace start script (next start -p 3001).
const npm = isWin ? 'npm.cmd' : 'npm';
launch('web', npm, ['run', 'start', '--workspace=apps/web'], { API_ORIGIN, PORT: WEB_PORT });

console.log(`\n  pdash (production) starting…`);
console.log(`    API  →  ${API_ORIGIN}/api/v1`);
console.log(`    Web  →  http://localhost:${WEB_PORT}`);
console.log(`    (Ctrl+C stops both)\n`);
