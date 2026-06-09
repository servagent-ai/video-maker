#!/usr/bin/env node
import { readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'outputs/comparison/current');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'video-maker.output.mp4') out.push(p);
  }
  return out;
}

const videos = walk(root).map((path) => {
  const rel = path.slice(root.length + 1);
  const id = rel.replace(/\/video-maker\.output\.mp4$/, '');
  return { id, rel };
}).sort((a, b) => a.id.localeCompare(b.id));

const first = videos[0];
const buttons = videos.map((v, i) => `
        <button class="item${i === 0 ? ' active' : ''}" data-src="${escapeAttr(v.rel)}" data-id="${escapeAttr(v.id)}">
          <span class="idx">${String(i + 1).padStart(2, '0')}</span>
          <span class="name">${escapeHtml(v.id)}</span>
        </button>`).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Video Maker Review</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101114;
      --panel: #181a1f;
      --panel2: #20232a;
      --text: #f2f4f8;
      --muted: #9aa3b2;
      --line: #303641;
      --accent: #58c7ff;
      --ok: #85e89d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      height: 100vh;
      overflow: hidden;
    }
    .app {
      display: grid;
      grid-template-columns: 360px minmax(0, 1fr);
      height: 100vh;
    }
    aside {
      border-right: 1px solid var(--line);
      background: var(--panel);
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 18px 18px 14px;
      border-bottom: 1px solid var(--line);
    }
    h1 {
      font-size: 18px;
      margin: 0 0 6px;
      font-weight: 650;
      letter-spacing: 0;
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
    }
    .list {
      padding: 10px;
      overflow: auto;
    }
    .item {
      width: 100%;
      min-height: 54px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text);
      display: grid;
      grid-template-columns: 38px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      text-align: left;
      padding: 8px;
      margin: 0 0 6px;
      border-radius: 6px;
      cursor: pointer;
    }
    .item:hover { background: var(--panel2); }
    .item.active {
      background: #102433;
      border-color: #245879;
    }
    .idx {
      color: var(--accent);
      font-variant-numeric: tabular-nums;
      font-size: 12px;
      justify-self: center;
    }
    .name {
      overflow-wrap: anywhere;
      font-size: 13px;
    }
    main {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: #0b0c0f;
    }
    .bar {
      padding: 14px 18px;
      border-bottom: 1px solid var(--line);
      display: flex;
      gap: 14px;
      align-items: center;
      justify-content: space-between;
      background: var(--panel);
    }
    .title {
      min-width: 0;
      overflow-wrap: anywhere;
      font-weight: 600;
    }
    .link {
      color: var(--ok);
      text-decoration: none;
      white-space: nowrap;
    }
    .stage {
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      overflow: auto;
    }
    video {
      width: min(420px, 100%);
      height: auto;
      max-height: calc(100vh - 110px);
      aspect-ratio: 9 / 16;
      display: block;
      background: #000;
      border: 1px solid var(--line);
      border-radius: 6px;
      object-fit: contain;
    }
    @media (max-width: 860px) {
      body { overflow: auto; height: auto; }
      .app { grid-template-columns: 1fr; height: auto; }
      aside { max-height: 42vh; }
      main { min-height: 58vh; }
      video { width: min(100%, 420px); height: auto; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside>
      <header>
        <h1>Video Maker Review</h1>
        <div class="meta">${videos.length} videos · production-normalized outputs</div>
      </header>
      <div class="list">
${buttons}
      </div>
    </aside>
    <main>
      <div class="bar">
        <div class="title" id="title">${first ? escapeHtml(first.id) : 'No videos found'}</div>
        <a class="link" id="openLink" href="${first ? escapeAttr(first.rel) : '#'}" target="_blank">Open MP4</a>
      </div>
      <div class="stage">
        <video id="player" controls playsinline preload="metadata" src="${first ? escapeAttr(first.rel) : ''}"></video>
      </div>
    </main>
  </div>
  <script>
    const player = document.getElementById('player');
    const title = document.getElementById('title');
    const openLink = document.getElementById('openLink');
    for (const btn of document.querySelectorAll('.item')) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.item').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        const src = btn.dataset.src;
        const id = btn.dataset.id;
        title.textContent = id;
        openLink.href = src;
        player.src = src;
        player.load();
        player.play().catch(() => {});
      });
    }
  </script>
</body>
</html>
`;

writeFileSync(join(root, 'review.html'), html);
console.log(`wrote ${join(root, 'review.html')}`);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}
