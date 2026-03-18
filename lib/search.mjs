// search.mjs — Keyword retrieval engine (TF-IDF)
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readIndex, readMemory, getStoreRoot } from './store.mjs';

// Tokenizer: CJK bigrams + English words
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  const eng = text.toLowerCase().match(/[a-z0-9_\-\.]+/g);
  if (eng) tokens.push(...eng);
  const cjk = text.match(/[\u4e00-\u9fff]+/g);
  if (cjk) {
    for (const seg of cjk) {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
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

function cosineSim(tfA, tfB) {
  let dot = 0, magA = 0, magB = 0;
  for (const t in tfA) {
    magA += tfA[t] ** 2;
    if (tfB[t]) dot += tfA[t] * tfB[t];
  }
  for (const t in tfB) magB += tfB[t] ** 2;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Tier weight: newer memories rank higher
const TIER_WEIGHT = { fresh: 1.0, recent: 0.85, faded: 0.6, ghost: 0.3, expired: 0 };

// Load optional user-defined domain aliases from store/config.json
// Format: { "domainAliases": { "payment": ["billing", "checkout"], ... } }
function loadDomainAliases() {
  const configPath = join(getStoreRoot(), 'config.json');
  if (!existsSync(configPath)) return {};
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config.domainAliases || {};
  } catch {
    return {};
  }
}

function domainAliasBoost(query, domain) {
  const aliases = loadDomainAliases()[domain];
  if (!aliases) return 0;
  const qLower = query.toLowerCase();
  let boost = 0;
  for (const alias of aliases) {
    if (qLower.includes(alias.toLowerCase())) boost += 0.4;
  }
  return Math.min(boost, 0.8);
}

function scoreEntry(qTokens, entry, query) {
  const summaryTokens = termFreq(tokenize(entry.summary || ''));
  const domainTokens = termFreq(tokenize(entry.domain || ''));

  // Summary match (primary signal)
  const summaryScore = cosineSim(qTokens, summaryTokens);
  // Domain direct match (3x weight)
  const domainScore = cosineSim(qTokens, domainTokens) * 3;
  // Optional alias boost from user config
  const aliasBoost = domainAliasBoost(query, entry.domain);
  // Tier weight
  const tierW = TIER_WEIGHT[entry.tier] || 0.5;

  return (summaryScore + domainScore + aliasBoost) * tierW;
}

export function scan(query) {
  const root = getStoreRoot();
  const index = readIndex(root);
  const qTokens = termFreq(tokenize(query));

  const domains = {};
  for (const entry of index) {
    if (entry.tier === 'expired') continue;
    const d = entry.domain || 'uncategorized';
    if (!domains[d]) domains[d] = { domain: d, count: 0, latest: null, maxScore: 0 };
    domains[d].count++;

    const score = scoreEntry(qTokens, entry, query);
    if (score > domains[d].maxScore) domains[d].maxScore = score;
    if (!domains[d].latest || new Date(entry.created) > new Date(domains[d].latest)) {
      domains[d].latest = entry.created;
    }
  }

  return Object.values(domains)
    .filter(d => d.maxScore > 0)
    .sort((a, b) => b.maxScore - a.maxScore);
}

export function focus(domain) {
  const root = getStoreRoot();
  const index = readIndex(root);

  const entries = index
    .filter(e => e.domain === domain && e.tier !== 'expired')
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  return entries.map(e => {
    const result = { ...e };
    if (e.tier === 'fresh' || e.tier === 'recent') {
      const full = readMemory(e.id, root);
      if (full) result.body = full.body;
    }
    return result;
  });
}

export function search(query, limit = 5) {
  const root = getStoreRoot();
  const index = readIndex(root);
  const qTokens = termFreq(tokenize(query));

  const scored = [];
  for (const entry of index) {
    if (entry.tier === 'expired') continue;
    const score = scoreEntry(qTokens, entry, query);
    if (score > 0) scored.push({ ...entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  return top.map(e => {
    const result = { ...e };
    if (e.tier === 'fresh' || e.tier === 'recent') {
      const full = readMemory(e.id, root);
      if (full) result.body = full.body;
    }
    return result;
  });
}
