import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const configUrl = new URL('../src-tauri/tauri.conf.json', import.meta.url);
const config = JSON.parse(await readFile(configUrl, 'utf8'));
const [window] = config.app.windows;

assert.equal(config.productName, 'Agent Code');
assert.equal(config.identifier, 'com.pitchlook.agentcode');
assert.equal(config.app.windows.length, 1);
assert.equal(window.width, 1280);
assert.equal(window.height, 800);
assert.equal(window.minWidth, 900);
assert.equal(window.minHeight, 620);
assert.equal(window.resizable, true);
assert.equal(window.decorations, true);
assert.equal(config.build.frontendDist, '../dist');

console.log('tauri-contract: PASS');
