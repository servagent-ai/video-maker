import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(args, opts = {}) {
  return spawnSync('node', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...opts,
  });
}

test('validate-spec CLI accepts repository examples', () => {
  const r = run(['scripts/validate-spec.mjs', 'specs/examples']);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /ok: validated 2 spec file/);
});

test('import-novel-video preserves public source contract fields', () => {
  const root = mkdtempProject();
  writeFileSync(join(root, 'series.json'), JSON.stringify({
    seriesId: 'series-a',
    episode: 2,
    totalEpisodes: 8,
    prevId: 'ep-1',
    nextId: 'ep-3',
  }));
  writeFileSync(join(root, 'captions.srt'), '1\n00:00:00,000 --> 00:00:03,000\nThe last survivor woke.\n');
  writeFileSync(join(root, 'storyboard.json'), JSON.stringify({
    title: 'The Silver Cocoon',
    logline: 'A crisis-first mythic short.',
    sourceUrl: 'https://example.com/source',
    license: 'example-license',
    transformative: { note: 'Proper nouns removed and narration rewritten.' },
    shots: [
      {
        narration: 'The last survivor woke beside a burning corpse.',
        narrationZh: '最后的幸存者在燃烧的尸体旁醒来。',
        imagePrompt: 'silver cocoon in ruins',
        stimPoint: true,
        identityHook: 'last survivor',
        visualAnchor: 'silver cocoon',
      },
      {
        narration: 'Then the corpse opened its eyes. Why did it have his face?',
        imagePrompt: 'duplicate face cliffhanger',
      },
    ],
  }));
  const out = join(root, 'video-maker.spec.json');
  const r = run(['scripts/import-novel-video.mjs', '--project', root, '--out', out]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const spec = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(spec.profile, 'levify-tales');
  assert.equal(spec.metadata.status, 'needs-render');
  assert.equal(spec.metadata.series.seriesId, 'series-a');
  assert.equal(spec.metadata.sourceUrl, 'https://example.com/source');
  assert.equal(spec.transformative.note, 'Proper nouns removed and narration rewritten.');
  assert.equal(spec.scenes[0].metadata.narrationZh, '最后的幸存者在燃烧的尸体旁醒来。');
  assert.ok(spec.assets.some((a) => a.role === 'sidecar-captions'));
});

test('side-hustle handoff emits stable youtube-only manifest for passing QA', () => {
  const root = mkdtempProject();
  const spec = {
    id: 'episode-1',
    title: 'Episode One',
    description: 'A short story episode.',
    sourceProject: 'side-hustle/novel-pipeline',
    quality: { transformativeNote: 'Rewritten.' },
  };
  writeFileSync(join(root, 'video-maker.spec.json'), JSON.stringify(spec));
  writeFileSync(join(root, 'quality-report.json'), JSON.stringify({ status: 'pass' }));
  writeFileSync(join(root, 'video.mp4'), 'placeholder');
  writeFileSync(join(root, 'captions.srt'), '1\n00:00:00,000 --> 00:00:01,000\nHi\n');
  const out = join(root, 'handoff.json');
  const r1 = run(['scripts/handoff-side-hustle.mjs', '--render-dir', root, '--out', out]);
  const first = readFileSync(out, 'utf8');
  const r2 = run(['scripts/handoff-side-hustle.mjs', '--render-dir', root, '--out', out]);
  const second = readFileSync(out, 'utf8');
  assert.equal(r1.status, 0, r1.stderr || r1.stdout);
  assert.equal(r2.status, 0, r2.stderr || r2.stdout);
  assert.equal(first, second);
  const handoff = JSON.parse(first);
  assert.equal(handoff.pieceId, 'video-episode-1');
  assert.deepEqual(handoff.platforms, ['youtube']);
  assert.equal(handoff.status, 'qa-passed');
});

function mkdtempProject() {
  const root = join(tmpdir(), `video-maker-ct-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  return root;
}
