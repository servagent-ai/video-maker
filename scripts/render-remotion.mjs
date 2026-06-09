#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const r = spawnSync('node', ['scripts/render-engine.mjs', '--engine', 'remotion', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
