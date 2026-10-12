import { spawnSync } from 'node:child_process';

// Prisma can parse the schema only when DATABASE_URL is present. This file runs
// during `npm run build`, and it must not replace a live URL.
if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

function run(command) {
  const result = spawnSync(command, { stdio: 'inherit', shell: true, env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('prisma generate');
run('next build');
