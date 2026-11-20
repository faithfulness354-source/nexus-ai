#!/usr/bin/env node
/**
 * Ensure Stable Diffusion Forge is listening on :7860 before the Nexus AI bridge runs.
 * Boots C:\sd-webui-forge\webui-user.bat (COMMANDLINE_ARGS includes --api --medvram-sdxl)
 * in a detached background process when the port is down, then waits until the API answers.
 *
 * Usage:
 *   node scripts/ensure-forge.mjs
 *   node scripts/ensure-forge.mjs --wait-only
 *   npm run forge:ensure
 */
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WEBUI_DIR = process.env.FORGE_DIR || 'C:\\sd-webui-forge';
const WEBUI_BAT = join(WEBUI_DIR, 'webui-user.bat');
const PORT = Number(process.env.FORGE_PORT || 7860);
const HOST = process.env.FORGE_HOST || '127.0.0.1';
const READY_URL = `http://${HOST}:${PORT}/sdapi/v1/progress?skip_current_image=true`;
const WAIT_MS = Number(process.env.FORGE_READY_WAIT_MS || 300_000);
const POLL_MS = 2_500;
const PID_FILE = join(ROOT, '.forge', 'forge.pid');
const LOG_FILE = join(ROOT, '.forge', 'forge-ensure.log');
const waitOnly = process.argv.includes('--wait-only');

function log(msg) {
  const line = `[forge-ensure] ${msg}`;
  console.log(line);
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    writeFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`, { flag: 'a' });
  } catch {
    /* ignore log IO */
  }
}

function portOpen(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok) => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function apiReady() {
  try {
    const res = await fetch(READY_URL, { signal: AbortSignal.timeout(5_000) });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

function startForge() {
  if (!existsSync(WEBUI_BAT)) {
    throw new Error(`webui-user.bat not found at ${WEBUI_BAT}. Set FORGE_DIR if Forge lives elsewhere.`);
  }
  log(`Starting Forge from ${WEBUI_DIR} (webui-user.bat → --api --medvram-sdxl)…`);
  mkdirSync(dirname(PID_FILE), { recursive: true });

  // Detached cmd window keeps Forge alive after this Node process exits.
  const child = spawn('cmd.exe', ['/c', 'webui-user.bat'], {
    cwd: WEBUI_DIR,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env: {
      ...process.env,
      // Reinforce required flags if webui-user.bat is edited later.
      COMMANDLINE_ARGS:
        process.env.COMMANDLINE_ARGS ||
        '--listen --api --enable-insecure-extension-access --theme dark --xformers --medvram-sdxl',
    },
  });
  child.unref();
  if (child.pid) {
    writeFileSync(PID_FILE, String(child.pid), 'utf8');
    log(`Spawned background launcher pid ${child.pid}`);
  }
}

async function waitUntilReady() {
  const deadline = Date.now() + WAIT_MS;
  let n = 0;
  while (Date.now() <= deadline) {
    n += 1;
    const listening = await portOpen(HOST, PORT);
    if (listening) {
      if (await apiReady()) {
        log(`Forge API ready on http://${HOST}:${PORT} (probe #${n})`);
        return;
      }
      log(`Port ${PORT} open but API not ready yet (probe #${n})…`);
    } else if (n === 1 || n % 4 === 0) {
      log(`Waiting for port ${PORT} (probe #${n})…`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(
    `Forge did not become ready on ${HOST}:${PORT} within ${Math.round(WAIT_MS / 1000)}s. Check the Forge window / ${LOG_FILE}`,
  );
}

async function main() {
  if (await apiReady()) {
    log(`Already running at http://${HOST}:${PORT}`);
    return;
  }

  const listening = await portOpen(HOST, PORT);
  if (!listening && !waitOnly) {
    startForge();
  } else if (!listening && waitOnly) {
    throw new Error(`Port ${PORT} is closed and --wait-only was set (will not start Forge).`);
  } else {
    log(`Port ${PORT} is open; waiting for /sdapi readiness…`);
  }

  await waitUntilReady();
}

main().catch((err) => {
  console.error(`[forge-ensure] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
