// Copies the wllama WASM binary into public/ so Next's static export ships it as a
// stable-path static asset (and thus into the Capacitor Android build). Runs on
// postinstall so it stays in sync automatically whenever @wllama/wllama is (re)installed.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@wllama', 'wllama', 'esm', 'wasm', 'wllama.wasm');
const destDir = path.join(__dirname, '..', 'public', 'wllama');
const dest = path.join(destDir, 'wllama.wasm');

if (!fs.existsSync(src)) {
  console.warn('[copy-wllama-assets] wllama.wasm not found at', src, '- skipping (is @wllama/wllama installed?)');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-wllama-assets] Copied wllama.wasm ->', dest);
