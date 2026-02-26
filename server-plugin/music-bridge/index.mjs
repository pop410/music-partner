import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const info = {
  id: 'music-bridge',
  name: 'Music Bridge (Netease)',
  description: 'Spawn and manage local Netease Cloud Music bridge server',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function resolveBridgeDir() {
  const envDir = process.env.BRIDGE_DIR && String(process.env.BRIDGE_DIR).trim();
  /** @type {string[]} */
  const candidates = [
    envDir || '',
    // when plugin installed alongside bridge under the same folder
    path.resolve(__dirname, 'bridge'),
    // when developing inside extensions/st-netease-music/server-plugin/music-bridge
    path.resolve(__dirname, '..', '..', 'bridge'),
    // common plugins layout
    path.resolve(process.cwd(), 'plugins', 'music-bridge', 'bridge'),
    // extension directory layout (for user-scoped extensions)
    path.resolve(process.cwd(), 'data', 'default-user', 'extensions', 'st-netease-music', 'bridge'),
    // repo root fallback
    path.resolve(process.cwd(), 'bridge'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'server.js'))) {
        return dir;
      }
    } catch {
      // ignore
    }
  }
  return candidates[0] || path.resolve(__dirname, '..', '..', 'bridge');
}

let bridgeDir = resolveBridgeDir();
let serverFile = path.join(bridgeDir, 'server.js');

/** @type {import('node:child_process').ChildProcessWithoutNullStreams | null} */
let child = null;
let restarting = false;

function log(prefix, msg) {
  const text = String(msg || '').trimEnd();
  if (!text) return;
  for (const line of text.split('\n')) {
    console.info(`[music-bridge] ${prefix}: ${line}`);
  }
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function fileSize(p) {
  try { return fs.statSync(p).size || 0; } catch { return 0; }
}

function envForBridge() {
  const env = { ...process.env };
  env.PORT = env.PORT || '3000';
  env.HOST = env.HOST || '0.0.0.0';
  env.ALLOW_ORIGIN = env.ALLOW_ORIGIN || '*';
  // Optional: API_TOKEN / USE_REAL_MEDIA_API can be passed through
  return env;
}

function needDepsInstall() {
  const nm = path.join(bridgeDir, 'node_modules');
  const pkg = path.join(bridgeDir, 'package.json');
  if (!exists(pkg)) return false;
  if (!exists(nm)) return true;
  // quick heuristics
  const must = ['express', 'body-parser', 'cors', 'NeteaseCloudMusicApi'];
  return must.some(name => !exists(path.join(nm, name)));
}

async function runInstall() {
  return new Promise(resolve => {
    const manager = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const argsList = [
      ['ci', '--omit=dev', '--no-audit', '--no-fund'],
      ['install', '--production', '--no-audit', '--no-fund'],
    ];
    let step = 0;
    const tryInstall = () => {
      if (step >= argsList.length) return resolve(false);
      const args = argsList[step++];
      console.info(`[music-bridge] installing deps: ${manager} ${args.join(' ')}`);
      const p = spawn(manager, args, { cwd: bridgeDir, env: envForBridge(), shell: false, windowsHide: true });
      p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
      p.stdout.on('data', d => log('install', d));
      p.stderr.on('data', d => log('install', d));
      p.on('close', code => {
        if (code === 0 && !needDepsInstall()) return resolve(true);
        console.warn(`[music-bridge] install step failed (code=${code}), trying fallback if available`);
        tryInstall();
      });
      p.on('error', () => {
        console.warn('[music-bridge] install spawn error, trying fallback');
        tryInstall();
      });
    };
    tryInstall();
  });
}

async function ensureTermuxApi() {
  const isTermux = 'TERMUX_VERSION' in process.env;
  if (!isTermux) return;

  return new Promise(resolve => {
    const check = spawn('which', ['termux-notification-list'], { shell: false });
    check.on('close', code => {
      if (code === 0) {
        console.info('[music-bridge] termux-api is already installed.');
        return resolve(true);
      }

      console.info('[music-bridge] termux-api not found, attempting to install...');
      const install = spawn('pkg', ['install', 'termux-api', '-y'], { stdio: 'inherit' });
      install.on('close', installCode => {
        if (installCode === 0) {
          console.info('[music-bridge] termux-api installed successfully.');
          resolve(true);
        } else {
          console.error('[music-bridge] Failed to install termux-api. Please install it manually.');
          resolve(false);
        }
      });
      install.on('error', () => {
        console.error('[music-bridge] Failed to spawn pkg command. Is this a Termux environment?');
        resolve(false);
      });
    });
    check.on('error', () => {
      console.error('[music-bridge] Failed to spawn which command.');
      resolve(false);
    });
  });
}

function spawnBridge() {
  if (!exists(serverFile)) {
    console.error(`[music-bridge] server.js not found. tried dir: ${bridgeDir}`);
    bridgeDir = resolveBridgeDir();
    serverFile = path.join(bridgeDir, 'server.js');
    if (!exists(serverFile)) {
      console.error(`[music-bridge] server.js still not found after re-resolve: ${bridgeDir}`);
      return;
    }
  }
  if (child) {
    console.info('[music-bridge] bridge already running');
    return;
  }

  const startServer = () => {
    const nodeExec = process.execPath || 'node';
    console.info(`[music-bridge] starting bridge: ${nodeExec} ${serverFile}`);
    console.info(`[music-bridge] cwd: ${bridgeDir}`);
    child = spawn(nodeExec, [serverFile], {
      cwd: bridgeDir,
      env: envForBridge(),
      shell: false,
      windowsHide: true,
    });
  
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => log('stdout', d));
    child.stderr.on('data', (d) => log('stderr', d));
    child.on('error', (e) => log('error', e?.message || String(e)));
    child.on('close', (code, sig) => {
      log('close', `exitCode=${code} signal=${sig ?? 'null'}`);
      child = null;
      if (!restarting) {
        setTimeout(spawnBridge, 1000);
      }
    });
  };

  const run = async () => {
    await ensureTermuxApi();

    if (needDepsInstall()) {
      runInstall()
        .then(ok => {
          if (!ok) {
            console.error('[music-bridge] dependencies installation failed; please run npm install manually in bridge directory');
            return;
          }
          startServer();
        })
        .catch(() => {
          console.error('[music-bridge] dependencies installation failed; please run npm install manually in bridge directory');
        });
      return;
    }
    startServer();
  };

  run();
}

function stopBridge() {
  restarting = true;
  if (!child) return;
  try { child.kill('SIGTERM'); } catch {}
  setTimeout(() => {
    try { child?.kill('SIGKILL'); } catch {}
    child = null;
    restarting = false;
  }, 1000);
}

spawnBridge();

process.on('SIGINT', () => {
  stopBridge();
});
process.on('SIGTERM', () => {
  stopBridge();
});
