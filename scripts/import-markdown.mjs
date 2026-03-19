#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';

const STORE = join(process.env.MEMORY_DECAY_STORE || process.cwd(), 'store');

function ensureDirs(root = STORE) {
  for (const d of ['fresh', 'archive', 'expired']) {
    mkdirSync(join(root, d), { recursive: true });
  }
  const indexPath = join(root, 'index.json');
  if (!existsSync(indexPath)) writeFileSync(indexPath, '[]\n', 'utf8');
  return root;
}

function readIndex(root = STORE) {
  const indexPath = join(root, 'index.json');
  if (!existsSync(indexPath)) return [];
  return JSON.parse(readFileSync(indexPath, 'utf8'));
}

function writeIndex(entries, root = STORE) {
  writeFileSync(join(root, 'index.json'), JSON.stringify(entries, null, 2) + '\n', 'utf8');
}

function writeMemory(entry, body, root = STORE) {
  ensureDirs(root);
  const file = join(root, 'fresh', `${entry.id}.json`);
  writeFileSync(file, JSON.stringify({ ...entry, body }, null, 2) + '\n', 'utf8');
  const index = readIndex(root);
  index.push(entry);
  writeIndex(index, root);
}

function collectMarkdownFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectMarkdownFiles(full));
    } else if (name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function extractDate(filename) {
  const m = basename(filename).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function firstLine(text) {
  const lines = text.split('\n');
  const skipPatterns = [/^\s*$/, /^#/, /^<!--/, /^>/, /^---$/, /^_/, /^\[/, /^```/, /^\| /, /^- -$/];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 8) continue;
    if (skipPatterns.some((p) => p.test(trimmed))) continue;
    const clean = trimmed
      .replace(/^\*\*/, '')
      .replace(/\*\*$/, '')
      .replace(/^- /, '')
      .replace(/^\d+\.\s*/, '');
    if (clean.length < 10) continue;
    return clean.slice(0, 150);
  }
  return '';
}

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/import-markdown.mjs <directory>');
  process.exit(1);
}

const root = ensureDirs();
const files = collectMarkdownFiles(dir);
const seenSummaries = new Set();
let imported = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const dateStr = extractDate(file);
  const created = dateStr ? new Date(`${dateStr}T12:00:00Z`).toISOString() : new Date().toISOString();
  const summary = firstLine(text) || basename(file, '.md');
  const dedupeKey = summary.slice(0, 80);
  if (seenSummaries.has(dedupeKey)) continue;
  seenSummaries.add(dedupeKey);

  const entry = {
    id: randomUUID(),
    created,
    type: 'reference',
    domain: 'general',
    summary,
    ttl: 'permanent',
    confidence: 0.7,
    tier: 'fresh',
  };

  writeMemory(entry, text, root);
  imported++;
}

console.log(`Imported ${imported} memories from ${dir}.`);
console.log('Run `node scripts/memory_decay.js decay` or `python3 scripts/memory_decay.py decay` to apply tier assignments.');
