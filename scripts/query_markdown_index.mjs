#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const INDEX_DIRNAME = '.memory-decay';
const INDEX_FILE = 'index.json';
const TIER_WEIGHT = { fresh: 1.0, recent: 0.85, faded: 0.6, ghost: 0.3, expired: 0 };

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

function loadIndex(memoryRoot) {
  const idxPath = join(resolve(memoryRoot, '..'), INDEX_DIRNAME, INDEX_FILE);
  if (!existsSync(idxPath)) {
    fail(`index not found: ${idxPath}\nRun: node scripts/sync_markdown_index.mjs ${memoryRoot}`);
  }
  return JSON.parse(readFileSync(idxPath, 'utf8'));
}

function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  const eng = text.toLowerCase().match(/[a-z0-9_\-.]+/g);
  if (eng) tokens.push(...eng);
  const cjk = text.match(/[\u4e00-\u9fff]+/g);
  if (cjk) {
    for (const seg of cjk) {
      for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2));
      for (const ch of seg) tokens.push(ch);
    }
  }
  return tokens;
}

function termFreq(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  return tf;
}

function cosineSim(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (const t in a) { magA += a[t] ** 2; if (b[t]) dot += a[t] * b[t]; }
  for (const t in b) magB += b[t] ** 2;
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function scoreEntry(qTokens, entry) {
  const summaryScore = cosineSim(qTokens, termFreq(tokenize(entry.summary || '')));
  const domainScore = cosineSim(qTokens, termFreq(tokenize(entry.domain || ''))) * 3;
  const tierW = TIER_WEIGHT[entry.tier] || 0.5;
  return (summaryScore + domainScore) * tierW;
}

function search(index, query, limit = 8) {
  const q = termFreq(tokenize(query));
  const out = [];
  for (const entry of index) {
    if (entry.tier === 'expired') continue;
    const score = scoreEntry(q, entry);
    if (score > 0) out.push({ ...entry, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function scan(index, query) {
  const q = termFreq(tokenize(query));
  const domains = {};
  for (const entry of index) {
    if (entry.tier === 'expired') continue;
    const domain = entry.domain || 'uncategorized';
    if (!domains[domain]) domains[domain] = { domain, count: 0, latest: null, maxScore: 0 };
    domains[domain].count++;
    const score = scoreEntry(q, entry);
    if (score > domains[domain].maxScore) domains[domain].maxScore = score;
    const created = entry.created;
    if (!domains[domain].latest || (created && created > domains[domain].latest)) domains[domain].latest = created;
  }
  return Object.values(domains).filter((d) => d.maxScore > 0).sort((a, b) => b.maxScore - a.maxScore);
}

function focus(index, domain) {
  return index
    .filter((e) => e.domain === domain && e.tier !== 'expired')
    .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
}

const args = process.argv.slice(2);
if (args.length < 1) fail('Usage: node scripts/query_markdown_index.mjs search <query> | scan <query> | focus <domain>');

const command = args[0];
const arg = args[1];
const memoryRoot = findMemoryRoot();
const index = loadIndex(memoryRoot);

if (command === 'search') {
  if (!arg) fail('Query required.');
  for (const e of search(index, arg)) {
    console.log(`[${e.tier}] ${e.domain} | ${e.summary} | ${e.source} | ${(e.score * 100).toFixed(0)}%`);
  }
} else if (command === 'scan') {
  if (!arg) fail('Query required.');
  for (const d of scan(index, arg)) {
    console.log(`${d.domain} (${d.count} memories, latest: ${(d.latest || '?').slice(0, 10)}, relevance: ${(d.maxScore * 100).toFixed(0)}%)`);
  }
} else if (command === 'focus') {
  if (!arg) fail('Domain required.');
  for (const e of focus(index, arg)) {
    console.log(`[${e.tier}] ${e.created.slice(0, 10)} | ${e.summary} | ${e.source}`);
  }
} else {
  fail(`Unknown command: ${command}`);
}
