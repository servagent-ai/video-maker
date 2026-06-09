#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const targets = args.length > 0 ? args : ['specs/examples'];

function collectJson(path) {
  const st = statSync(path);
  if (st.isFile()) return path.endsWith('.json') ? [path] : [];
  const out = [];
  for (const name of readdirSync(path)) out.push(...collectJson(join(path, name)));
  return out;
}

function fail(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function validate(spec, path) {
  const errors = [];
  for (const key of ['id', 'profile', 'format', 'language', 'captionPolicy', 'scenes', 'publishTargets', 'quality']) {
    if (!(key in spec)) fail(errors, path, `missing required field "${key}"`);
  }
  if (!spec.id || typeof spec.id !== 'string') fail(errors, path, 'id must be a non-empty string');
  if (!spec.profile || typeof spec.profile !== 'string') fail(errors, path, 'profile must be a non-empty string');
  if (!spec.format || typeof spec.format !== 'object') {
    fail(errors, path, 'format must be an object');
  } else {
    for (const key of ['width', 'height', 'fps', 'durationSec']) {
      if (typeof spec.format[key] !== 'number' || spec.format[key] <= 0) {
        fail(errors, path, `format.${key} must be a positive number`);
      }
    }
  }
  const captionMode = spec.captionPolicy?.mode;
  if (!['burned', 'sidecar', 'none'].includes(captionMode)) {
    fail(errors, path, 'captionPolicy.mode must be burned, sidecar, or none');
  }
  if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) {
    fail(errors, path, 'scenes must be a non-empty array');
  } else {
    let cursor = 0;
    for (const [i, scene] of spec.scenes.entries()) {
      const prefix = `scenes[${i}]`;
      if (!scene.id) fail(errors, path, `${prefix}.id is required`);
      if (typeof scene.startSec !== 'number' || scene.startSec < 0) fail(errors, path, `${prefix}.startSec must be >= 0`);
      if (typeof scene.durationSec !== 'number' || scene.durationSec <= 0) fail(errors, path, `${prefix}.durationSec must be > 0`);
      if (!scene.visual?.kind) fail(errors, path, `${prefix}.visual.kind is required`);
      if (scene.startSec < cursor - 0.001) fail(errors, path, `${prefix} overlaps or starts before previous scene ends`);
      cursor = scene.startSec + scene.durationSec;
    }
  }
  if (!Array.isArray(spec.publishTargets) || spec.publishTargets.length === 0) {
    fail(errors, path, 'publishTargets must be a non-empty array');
  }
  if (!Array.isArray(spec.quality?.gates)) {
    fail(errors, path, 'quality.gates must be an array');
  }
  if (spec.profile === 'levify-tales') {
    if (spec.format?.width !== 1080 || spec.format?.height !== 1920) {
      fail(errors, path, 'levify-tales expects 1080x1920 portrait output');
    }
    if (captionMode !== 'sidecar') fail(errors, path, 'levify-tales requires sidecar captions');
    if (!spec.quality?.transformativeNote) fail(errors, path, 'levify-tales requires quality.transformativeNote');
    if (!spec.publishTargets.includes('youtube')) fail(errors, path, 'levify-tales must target youtube');
  }
  if (spec.profile === 'zhibo-tech-workflow') {
    const isPortrait = spec.format?.width === 1080 && spec.format?.height === 1920;
    const isLandscape = spec.format?.width === 1920 && spec.format?.height === 1080;
    if (!isPortrait && !isLandscape) {
      fail(errors, path, 'zhibo-tech-workflow expects 1080x1920 portrait or 1920x1080 landscape-by-mode output');
    }
    if (captionMode !== 'burned') fail(errors, path, 'zhibo-tech-workflow requires burned captions');
  }
  return errors;
}

const files = targets.flatMap((p) => collectJson(join(root, p)));
const errors = [];
for (const file of files) {
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  errors.push(...validate(spec, file));
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`ok: validated ${files.length} spec file(s)`);
