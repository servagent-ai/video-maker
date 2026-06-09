import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('publish handoff refuses failed QA', () => {
  const dir = mkdtempSync(join(tmpdir(), 'video-maker-handoff-'));
  const qa = join(dir, 'quality-report.json');
  writeFileSync(qa, JSON.stringify({ status: 'fail', video: join(dir, 'video.mp4') }));
  const r = spawnSync('node', ['scripts/publish-handoff.mjs', '--adapter', 'manual', '--qa', qa, '--render', dir, '--out', join(dir, 'handoff')], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /refusing publish handoff/);
});

test('zhibo handoff caps Kuaishou tags at four', () => {
  const dir = mkdtempSync(join(tmpdir(), 'video-maker-handoff-'));
  const qa = join(dir, 'quality-report.json');
  const spec = join(dir, 'video-maker.spec.json');
  const out = join(dir, 'handoff');
  writeFileSync(qa, JSON.stringify({ status: 'pass', video: join(dir, 'video.mp4') }));
  writeFileSync(spec, JSON.stringify({
    id: 'case-1',
    title: 'Case 1',
    publishTargets: ['kuaishou'],
    metadata: { tags: ['a', 'b', 'c', 'd', 'e'] },
  }));
  const r = spawnSync('node', ['scripts/publish-handoff.mjs', '--adapter', 'zhibo-sau', '--qa', qa, '--render', dir, '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const handoff = JSON.parse(readFileSync(join(out, 'handoff.json'), 'utf8'));
  assert.deepEqual(handoff.platforms[0].tags, ['a', 'b', 'c', 'd']);
});
