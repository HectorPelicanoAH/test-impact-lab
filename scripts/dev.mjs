import { spawn } from 'node:child_process';

const children = ['dev:backend', 'dev:frontend', 'dev:demo-api', 'dev:demo'].map(script => spawn('pnpm', [script], { stdio: 'inherit', detached: process.platform !== 'win32' }));
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
  }
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', error => { console.error(error); stop(1); });
  child.on('exit', code => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
