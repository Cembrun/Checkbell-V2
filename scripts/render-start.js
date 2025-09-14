#!/usr/bin/env node
// Simple start script that runs the backend server in production (Render) and vite in dev.
// Detect production via NODE_ENV=production or presence of RENDER or RENDER_REGION env var.
const { spawn } = await import('child_process');
import path from 'path';

const isRender = !!process.env.RENDER || !!process.env.RENDER_REGION || process.env.CI === 'true';
const isProduction = process.env.NODE_ENV === 'production' || isRender;

if (isProduction) {
  const serverPath = path.resolve(process.cwd(), 'backend', 'server.js');
  console.log('Starting backend server for production:', serverPath);
  const child = spawn(process.execPath, [serverPath], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code));
} else {
  // Default to running vite for local dev (preserves previous behavior)
  console.log('Starting vite (development mode)');
  const child = spawn(process.execPath, [
    '-e',
    `import('child_process').then(c=>c.spawn('npx', ['vite'], {stdio:'inherit'}))`
  ], { stdio: 'inherit', shell: true });
  child.on('exit', (code) => process.exit(code));
}
