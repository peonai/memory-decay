#!/usr/bin/env node
/**
 * sync_markdown_index.mjs — Build a derived index from markdown memory files.
 *
 * Splits files into sections by ## headings, each section gets its own index
 * entry with independent metadata from inline <!-- meta --> tags.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative, basename } from 'path';
import { createHash } from 'crypto';

const INDEX_DIRNAME = '.memory-decay';
const INDEX_FILE = 'index.json';
const VALID_TYPES = new Set(['decision', 'experiment', 'reference', 'status', 'temporary']);
const VALID_TTLS = new Set(['3d', '7d', '30d', 'permanent']);
const META_RE = /<!--\s*meta:\s*([^>]*)-->/;
const KV_RE_SRC = /(type|ttl|confidence)\s*=\s*([^,\s]+)/g;

const SKIP_RES = [
  /^\s*$/, /^#{1,6}\s/, /^<!--/, /^>/, /^---$/, /^_/, /^\[/, /^```/,
  /^\|\s/, /^-\s-/, /^\*\*[^*]+\*\*\s*[:：]/, /^-\s+\*\*[^*]+\*\*\s*[:：]/,
  /^(assistant|user|A|system)\s*:/, /^Sender\s/, /^Conversation\s+info/,
  /^\{/, /^"/,
];

function fail(msg) { console.error(msg); process.exit(1); }

function findMemoryRoot(start) {
  let cur = resolve(start || process.cwd());
  while (cur !== '/' && cur !== resolve(cur, '..')) {
    if (existsSync(join(cur, 'memory'))) return join(cur, 'memory');
    cur = resolve(cur, '..');
  }
  return join(resolve(start || process.cwd()), 'memory');
}

function entryId(filePath, sectionIdx) {
  const key = `${resolve(filePath)}#s${sectionIdx}`;
  return createHash('sha1').update(key).digest('hex')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5');
}

function parseMeta(line) {
  const match = META_RE.exec(line);
  if (!match) return {};
  const meta = {};
  const re = new RegExp(KV_RE_SRC.source, 'g');
  let m;
  while ((m = re.exec(match[1])) !== null) meta[m[1]] = m[2].trim();
  return meta;
}

function inferCreated(filePath) {
  return new Date(statSync(filePath).mtimeMs).toISOString();
}

function inferDomain(filePath, memoryRoot) {
  const rel = relative(memoryRoot, filePath);
  const parts = rel.split(/[/\\]/);
  return parts.length >= 2 ? parts[0] : 'general';
}

function isSkipLine(trimmed) {
  if (trimmed.length < 8) return true;
  return SKIP_RES.some(r => r.test(trimmed));
}

function extractSummary(lines, maxLen = 200) {
  const cands = [];
  for (const line of lines) {
    const t = line.trim();
    if (isSkipLine(t)) continue;
    let c = t.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
    if (c.startsWith('**')) c = c.slice(2);
    if (c.endsWith('**')) c = c.slice(0, -2);
    c = c.trim();
    if (c.length >= 10) cands.push(c);
  }
  if (!cands.length) return '';
  if (cands[0].length >= 40) return cands[0].slice(0, maxLen);
  return cands.slice(0, 3).join('; ').slice(0, maxLen);
}

function splitSections(lines) {
  const secs = [];
  let cur = { heading: null, meta: {}, lines: [], start: 0 };
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (s.startsWith('## ')) {
      if (cur.lines.length || cur.heading) secs.push(cur);
      cur = { heading: s.replace(/^#+\s*/, ''), meta: {}, lines: [], start: i };
      continue;
    }
    const m = parseMeta(s);
    if (Object.keys(m).length) { Object.assign(cur.meta, m); continue; }
    cur.lines.push(lines[i]);
  }
  if (cur.lines.length || cur.heading) secs.push(cur);
  return secs;
}

function isChatDumpSection(sec) {
  const h = (sec.heading || '').toLowerCase();
  if (h.includes('conversation summary') || h.includes('chat log')) return true;
  const content = sec.lines.map(l => l.trim()).filter(Boolean);
  if (content.length <= 3) return false;
  const chatLines = content.filter(l => /^(assistant|user|A|system)\s*:/.test(l)).length;
  return chatLines / content.length > 0.4;
}

function resolveMeta(meta) {
  let type = meta.type || 'reference';
  let ttl = meta.ttl || '30d';
  let conf = parseFloat(meta.confidence || '0.7');
  if (!VALID_TYPES.has(type)) type = 'reference';
  if (!VALID_TTLS.has(ttl)) ttl = '30d';
  if (isNaN(conf)) conf = 0.7;
  conf = Math.min(Math.max(conf, 0), 1);
  return { type, ttl, confidence: conf };
}

function ageDays(created) {
  return (Date.now() - new Date(created).getTime()) / 86400000;
}

function parseTTL(ttl) {
  if (ttl === 'permanent') return Infinity;
  const m = String(ttl || '').match(/^(\d+)d$/);
  return m ? parseInt(m[1], 10) : 30;
}

function computeTier(created, ttl) {
  if (ttl === 'permanent') return 'fresh';
  const d = ageDays(created);
  if (d > parseTTL(ttl)) return 'expired';
  if (d <= 3) return 'fresh';
  if (d <= 14) return 'recent';
  if (d <= 30) return 'faded';
  return 'ghost';
}

function collectFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === INDEX_DIRNAME) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...collectFiles(full));
    else if (name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

function parseFile(filePath, memoryRoot) {
  const text = readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const secs = splitSections(lines);
  const created = inferCreated(filePath);
  const domain = inferDomain(filePath, memoryRoot);
  const entries = [];

  secs.forEach((sec, i) => {
    if (isChatDumpSection(sec)) return;
    const { type, ttl, confidence } = resolveMeta(sec.meta);
    let summary = extractSummary(sec.lines);
    if (!summary && sec.heading) summary = sec.heading;
    if (!summary) return;
    entries.push({
      id: entryId(filePath, i),
      source: resolve(filePath),
      sourceType: 'markdown',
      section: sec.heading || `section-${i}`,
      lineStart: sec.start,
      created, type, domain, summary, ttl, confidence,
      tier: computeTier(created, ttl),
    });
  });
  return entries;
}

const DOMAIN_PRIORITY = {episodic:0, semantic:1, procedural:2, learnings:3,
  snapshots:4, general:5, legacy:8, archive:9};

function dedupEntries(entries) {
  const seen = new Map();
  for (const e of entries) {
    const key = e.summary.slice(0, 120);
    if (!seen.has(key)) { seen.set(key, e); continue; }
    const ex = seen.get(key);
    const ePri = DOMAIN_PRIORITY[e.domain] ?? 6;
    const exPri = DOMAIN_PRIORITY[ex.domain] ?? 6;
    if (ePri < exPri || (ePri === exPri && e.created > ex.created)) seen.set(key, e);
  }
  return [...seen.values()];
}

// --- main ---
const memoryRoot = resolve(process.argv[2] || findMemoryRoot());
if (!existsSync(memoryRoot)) fail(`memory root not found: ${memoryRoot}`);

const idxDir = join(resolve(memoryRoot, '..'), INDEX_DIRNAME);
mkdirSync(idxDir, { recursive: true });
const idxPath = join(idxDir, INDEX_FILE);

const files = collectFiles(memoryRoot);
const raw = [];
for (const f of files) raw.push(...parseFile(f, memoryRoot));
const entries = dedupEntries(raw);

writeFileSync(idxPath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
const tiers = {};
for (const e of entries) tiers[e.tier] = (tiers[e.tier] || 0) + 1;
const deduped = raw.length - entries.length;
console.log(`Indexed ${entries.length} sections from ${files.length} files into ${idxPath}`);
if (deduped) console.log(`Deduped: ${deduped} duplicate entries removed`);
console.log(`Tiers: ${JSON.stringify(tiers)}`);
