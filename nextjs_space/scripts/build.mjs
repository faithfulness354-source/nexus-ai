import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

function run(command) {
  const result = spawnSync(command, { stdio: 'inherit', shell: true, env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('prisma generate');
run('next build');
