#!/usr/bin/env node
/**
 * query_markdown_index.mjs — Search, scan, and focus the memory-decay index.
 *
 * Now matches against section headings and includes substring boost.
 */
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const INDEX_DIRNAME = '.memory-decay';
const INDEX_FILE = 'index.json';
const TIER_WEIGHT = { fresh: 1.0, recent: 0.85, faded: 0.6, ghost: 0.3, expired: 0 };

function fail(msg) { console.error(msg); process.exit(1); }

function findMemoryRoot(start) {
  let cur = resolve(start || process.cwd());
  while (cur !== '/' && cur !== resolve(cur, '..')) {
    if (existsSync(join(cur, 'memory'))) return join(cur, 'memory');
    cur = resolve(cur, '..');
  }
  return join(resolve(start || process.cwd()), 'memory');
}

function loadIndex(memoryRoot) {
  const p = join(resolve(memoryRoot, '..'), INDEX_DIRNAME, INDEX_FILE);
  if (!existsSync(p)) fail(`index not found: ${p}\nRun: node scripts/sync_markdown_index.mjs ${memoryRoot}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  const eng = text.toLowerCase().match(/[a-z0-9_\-.]+/g);
  if (eng) tokens.push(...eng);
  const cjk = text.match(/[\u4e00-\u9fff]+/g);
  if (cjk) for (const seg of cjk) {
    for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2));
    for (const ch of seg) tokens.push(ch);
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
  return (!magA || !magB) ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function substringBoost(query, text) {
  return (query && text.toLowerCase().includes(query.toLowerCase())) ? 0.3 : 0;
}

function scoreEntry(qTokens, entry, rawQuery = '') {
  const summaryText = entry.summary || '';
  const sectionText = entry.section || '';
  const domainText = entry.domain || '';
  const summaryScore = cosineSim(qTokens, termFreq(tokenize(summaryText)));
  const sectionScore = cosineSim(qTokens, termFreq(tokenize(sectionText))) * 2;
  const domainScore = cosineSim(qTokens, termFreq(tokenize(domainText))) * 3;
  const subBoost = rawQuery
    ? Math.max(substringBoost(rawQuery, summaryText), substringBoost(rawQuery, sectionText))
    : 0;
  const tierW = TIER_WEIGHT[entry.tier] || 0.5;
  return (summaryScore + sectionScore + domainScore + subBoost) * tierW;
}

function search(index, query, limit = 8) {
  const q = termFreq(tokenize(query));
  const out = [];
  for (const e of index) {
    if (e.tier === 'expired') continue;
    const score = scoreEntry(q, e, query);
    if (score > 0) out.push({ ...e, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

function scan(index, query) {
  const q = termFreq(tokenize(query));
  const domains = {};
  for (const e of index) {
    if (e.tier === 'expired') continue;
    const d = e.domain || 'uncategorized';
    if (!domains[d]) domains[d] = { domain: d, count: 0, latest: null, maxScore: 0 };
    domains[d].count++;
    const score = scoreEntry(q, e, query);
    if (score > domains[d].maxScore) domains[d].maxScore = score;
    if (!domains[d].latest || (e.created && e.created > domains[d].latest)) domains[d].latest = e.created;
  }
  return Object.values(domains).filter(d => d.maxScore > 0).sort((a, b) => b.maxScore - a.maxScore);
}

function focus(index, domain) {
  return index.filter(e => e.domain === domain && e.tier !== 'expired')
    .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
}

const args = process.argv.slice(2);
if (!args.length) fail('Usage: node query_markdown_index.mjs search|scan|focus <arg>');
const [command, arg] = args;
const index = loadIndex(findMemoryRoot());

if (command === 'search') {
  if (!arg) fail('Query required.');
  for (const e of search(index, arg))
    console.log(`[${e.tier}] ${e.domain} | ${e.summary} | ${e.source} | ${(e.score*100).toFixed(0)}%`);
} else if (command === 'scan') {
  if (!arg) fail('Query required.');
  for (const d of scan(index, arg))
    console.log(`${d.domain} (${d.count} memories, latest: ${(d.latest||'?').slice(0,10)}, relevance: ${(d.maxScore*100).toFixed(0)}%)`);
} else if (command === 'focus') {
  if (!arg) fail('Domain required.');
  for (const e of focus(index, arg))
    console.log(`[${e.tier}] ${e.created.slice(0,10)} | ${e.summary} | ${e.source}`);
} else fail(`Unknown command: ${command}`);
