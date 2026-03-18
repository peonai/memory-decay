// store.mjs — 文件系统存储层
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, readdirSync } from 'fs';
import { join } from 'path';

const DEFAULT_STORE = join(process.env.MEMORY_DECAY_STORE || process.cwd(), 'store');

export function ensureDirs(root = DEFAULT_STORE) {
  for (const d of ['fresh', 'archive', 'expired']) {
    mkdirSync(join(root, d), { recursive: true });
  }
  const idx = join(root, 'index.json');
  if (!existsSync(idx)) writeFileSync(idx, '[]', 'utf8');
  return root;
}

export function readIndex(root = DEFAULT_STORE) {
  const idx = join(root, 'index.json');
  if (!existsSync(idx)) return [];
  return JSON.parse(readFileSync(idx, 'utf8'));
}

export function writeIndex(entries, root = DEFAULT_STORE) {
  writeFileSync(join(root, 'index.json'), JSON.stringify(entries, null, 2), 'utf8');
}

export function writeMemory(entry, body, root = DEFAULT_STORE) {
  ensureDirs(root);
  const dir = entry.tier === 'expired' ? 'expired' : (entry.tier === 'ghost' || entry.tier === 'faded') ? 'archive' : 'fresh';
  const file = join(root, dir, `${entry.id}.json`);
  writeFileSync(file, JSON.stringify({ ...entry, body }, null, 2), 'utf8');

  const index = readIndex(root);
  const existing = index.findIndex(e => e.id === entry.id);
  const meta = { ...entry };
  delete meta.body; // index 不存 body
  if (existing >= 0) index[existing] = meta;
  else index.push(meta);
  writeIndex(index, root);
}

export function readMemory(id, root = DEFAULT_STORE) {
  for (const dir of ['fresh', 'archive', 'expired']) {
    const file = join(root, dir, `${id}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  }
  return null;
}

export function moveMemory(id, fromDir, toDir, root = DEFAULT_STORE) {
  const src = join(root, fromDir, `${id}.json`);
  const dst = join(root, toDir, `${id}.json`);
  if (existsSync(src)) {
    mkdirSync(join(root, toDir), { recursive: true });
    renameSync(src, dst);
  }
}

export function getStoreRoot() {
  return DEFAULT_STORE;
}

export function countFiles(dir, root = DEFAULT_STORE) {
  const p = join(root, dir);
  if (!existsSync(p)) return 0;
  return readdirSync(p).filter(f => f.endsWith('.json')).length;
}
