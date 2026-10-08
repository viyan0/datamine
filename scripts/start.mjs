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
  ['node_modules/next/dist/bin/next', 'start', '-H', '0.0.0.0', '-p', process.env.PORT || '3000'],
  { stdio: 'inherit', env: process.env },
);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 1));
