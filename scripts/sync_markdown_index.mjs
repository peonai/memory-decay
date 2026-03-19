#!/usr/bin/env node
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative, basename } from 'path';
import { createHash } from 'crypto';

const INDEX_DIRNAME = '.memory-decay';
const INDEX_FILE = 'index.json';
const VALID_TYPES = new Set(['decision', 'experiment', 'reference', 'status', 'temporary']);
const VALID_TTLS = new Set(['3d', '7d', '30d', 'permanent']);
const META_RE = /<!--\s*meta:\s*([^>]*)-->/;
const KV_RE = /(type|ttl|confidence)\s*=\s*([^,\s]+)/g;
const DATE_RE = /(\d{4}-\d{2}-\d{2})/;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function findMemoryRoot(start) {
  let current = resolve(start || process.cwd());
  while (current !== '/') {
    if (existsSync(join(current, 'memory'))) return join(current, 'memory');
    current = resolve(current, '..');
  }
  return join(resolve(start || process.cwd()), 'memory');
}

function uuid5(path) {
  return createHash('sha1').update(path).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5');
}

function parseMeta(line) {
  const match = META_RE.exec(line);
  if (!match) return {};
  const meta = {};
  let m;
  const re = new RegExp(KV_RE.source, 'g');
  while ((m = re.exec(match[1])) !== null) {
    meta[m[1]] = m[2].trim();
  }
  return meta;
}

function inferCreated(filePath) {
  const match = DATE_RE.exec(basename(filePath));
  if (match) return new Date(`${match[1]}T12:00:00Z`).toISOString();
  const stat = statSync(filePath);
  return new Date(stat.mtimeMs).toISOString();
}

function inferDomain(filePath, memoryRoot) {
  const rel = relative(memoryRoot, filePath);
  const parts = rel.split('/');
  if (parts.length >= 2) return parts[0];
  const stem = basename(filePath, '.md');
  return stem.includes('-') ? stem.split('-')[0] : 'general';
}

function firstContentLine(lines) {
  const skipPatterns = [/^\s*$/, /^#/, /^<!--/, /^>/, /^---$/, /^_/, /^\[/, /^```/, /^\| /, /^- -$/];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 8) continue;
    if (skipPatterns.some((p) => p.test(trimmed))) continue;
    let clean = trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^- /, '').replace(/^\d+\.\s*/, '');
    if (clean.length >= 10) return clean.slice(0, 150);
  }
  return '';
}

function ageDays(created) {
  return (Date.now() - new Date(created).getTime()) / 86400000;
}

function parseTTL(ttl) {
  if (ttl === 'permanent') return Infinity;
  const m = String(ttl || '').match(/^(\d+)d$/);
  return m ? parseInt(m[1], 10) : 30;
}

function tierForAge(days) {
  if (days <= 3) return 'fresh';
  if (days <= 14) return 'recent';
  if (days <= 30) return 'faded';
  return 'ghost';
}

function computeTier(entry) {
  if (entry.ttl === 'permanent') return 'fresh';
  const days = ageDays(entry.created);
  if (days > parseTTL(entry.ttl)) return 'expired';
  return tierForAge(days);
}

function collectMarkdownFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === INDEX_DIRNAME) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...collectMarkdownFiles(full));
    else if (name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

function parseMarkdownFile(filePath, memoryRoot) {
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  let meta = {};
  for (const line of lines.slice(0, 12)) {
    const maybe = parseMeta(line);
    if (Object.keys(maybe).length) { meta = maybe; break; }
  }
  let type = meta.type || 'reference';
  let ttl = meta.ttl || '30d';
  let confidence = parseFloat(meta.confidence || '0.7');
  if (!VALID_TYPES.has(type)) type = 'reference';
  if (!VALID_TTLS.has(ttl)) ttl = '30d';
  if (isNaN(confidence)) confidence = 0.7;
  confidence = Math.min(Math.max(confidence, 0), 1);

  return {
    id: uuid5(resolve(filePath)),
    source: resolve(filePath),
    sourceType: 'markdown',
    created: inferCreated(filePath),
    type,
    domain: inferDomain(filePath, memoryRoot),
    summary: firstContentLine(lines) || basename(filePath, '.md'),
    ttl,
    confidence,
  };
}

const memoryRoot = resolve(process.argv[2] || findMemoryRoot());
if (!existsSync(memoryRoot)) fail(`memory root not found: ${memoryRoot}`);

const idxDir = join(resolve(memoryRoot, '..'), INDEX_DIRNAME);
mkdirSync(idxDir, { recursive: true });
const idxPath = join(idxDir, INDEX_FILE);

const entries = [];
for (const filePath of collectMarkdownFiles(memoryRoot)) {
  const entry = parseMarkdownFile(filePath, memoryRoot);
  entry.tier = computeTier(entry);
  entries.push(entry);
}

writeFileSync(idxPath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
console.log(`Indexed ${entries.length} markdown memories into ${idxPath}`);
