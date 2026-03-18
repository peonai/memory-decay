#!/usr/bin/env node
// 从 OpenClaw workspace memory 导入到 memory-decay
import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { v4 as uuid } from 'uuid';
import { ensureDirs, writeMemory } from '../lib/store.mjs';

const WORKSPACE = process.env.HOME + '/.openclaw/workspace/memory';
const root = ensureDirs();

function extractDate(filename) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function guessDomain(text, filename) {
  const combined = (text + ' ' + filename).toLowerCase();
  const domainMap = {
    'blog': ['blog', 'hugo', 'peon.blog', 'newspaper', '博客', '文章'],
    'payment': ['creem', 'stripe', 'payment', '支付', 'checkout', 'license'],
    'chrome-ext': ['chrome', 'extension', 'translator', 'bookmarker', '插件', 'side-by-side'],
    'infra': ['gateway', 'deploy', 'server', 'nginx', 'pm2', 'tailscale', 'ssh', 'cron', '部署', '运维'],
    'comic': ['comic', '漫画', 'panel', 'episode'],
    'openclaw': ['openclaw', 'clawd', 'skill', 'agent', 'heartbeat', 'memory-manager'],
    'feishu': ['feishu', '飞书', 'lark'],
    'tts': ['tts', '语音', 'edge-tts', 'whisper'],
    'moltbook': ['moltbook'],
    'douyin': ['douyin', '抖音'],
    'design': ['design', 'ui', 'ux', '设计', 'figma', 'layout'],
    'discord': ['discord', 'bot', '频道'],
  };
  for (const [domain, keywords] of Object.entries(domainMap)) {
    if (keywords.some(k => combined.includes(k))) return domain;
  }
  return 'general';
}

function guessType(dir, filename, text) {
  if (dir === 'procedural') return 'reference';
  if (dir === 'semantic') {
    if (text.includes('决定') || text.includes('选择') || text.includes('确定')) return 'decision';
    return 'reference';
  }
  // episodic
  if (text.includes('试了') || text.includes('experiment') || text.includes('测试')) return 'experiment';
  if (text.includes('决定') || text.includes('确定') || text.includes('方案')) return 'decision';
  if (text.includes('状态') || text.includes('进度') || text.includes('status')) return 'status';
  return 'reference';
}

function guessTTL(type, dir) {
  if (type === 'decision') return 'permanent';
  if (dir === 'semantic') return 'permanent';
  if (dir === 'procedural') return 'permanent';
  if (type === 'experiment') return '7d';
  if (type === 'temporary') return '3d';
  return '30d';
}

function firstLine(text) {
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('<!--') && !l.startsWith('>') && !l.startsWith('---'));
  return (lines[0] || '').trim().slice(0, 120);
}

let imported = 0;

for (const dir of ['episodic', 'semantic', 'procedural']) {
  const dirPath = join(WORKSPACE, dir);
  let files;
  try { files = readdirSync(dirPath).filter(f => f.endsWith('.md')); } catch { continue; }

  for (const file of files) {
    const text = readFileSync(join(dirPath, file), 'utf8');
    const dateStr = extractDate(file);
    const created = dateStr ? new Date(dateStr + 'T12:00:00+08:00').toISOString() : new Date().toISOString();
    const domain = guessDomain(text, file);
    const type = guessType(dir, file, text);
    const ttl = guessTTL(type, dir);
    const summary = firstLine(text) || basename(file, '.md');

    const entry = {
      id: uuid(),
      created,
      type,
      domain,
      summary,
      ttl,
      confidence: dir === 'semantic' ? 0.85 : dir === 'procedural' ? 0.9 : 0.7,
      tier: 'fresh',
      source: `${dir}/${file}`,
    };

    writeMemory(entry, text, root);
    imported++;
  }
}

console.log(`✅ Imported ${imported} memories from OpenClaw workspace.`);
console.log('Run `node bin/cli.mjs decay` to apply tier assignments.');
