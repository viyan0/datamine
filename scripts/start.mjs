import { spawn } from 'node:child_process';
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Startup step exited ${code}`)),
    );
  });
}
await run(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts']);
await run(process.execPath, ['--import', 'tsx', 'scripts/bootstrap.ts']);
const server = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    process.argv.includes('--dev') ? 'dev' : 'start',
    '-H',
    '0.0.0.0',
    '-p',
    process.env.PORT || '3000',
  ],
  { stdio: 'inherit', env: process.env },
);
const automation =
  process.env.AUTOMATION_DISABLED === 'true'
    ? null
    : spawn(process.execPath, ['--import', 'tsx', 'scripts/automation.ts'], {
        stdio: 'inherit',
        env: process.env,
      });
const children = [server, ...(automation ? [automation] : [])];
let stopping = false,
  exitCode = 0;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stop());
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => {
    if (!stopping) stop(code || 1);
    if (children.every((p) => p.exitCode !== null || p.signalCode !== null)) process.exit(exitCode);
  });
}
