// search.mjs — 模糊检索引擎（TF-IDF 风格关键词匹配）
import { readIndex, readMemory, getStoreRoot } from './store.mjs';

// 简单分词：中文按字切，英文按空格/标点切
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  // 英文单词
  const eng = text.toLowerCase().match(/[a-z0-9_\-\.]+/g);
  if (eng) tokens.push(...eng);
  // 中文：bigram
  const cjk = text.match(/[\u4e00-\u9fff]+/g);
  if (cjk) {
    for (const seg of cjk) {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
      // 也加单字，提高召回
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

// tier 权重：越新的记忆权重越高
const TIER_WEIGHT = { fresh: 1.0, recent: 0.85, faded: 0.6, ghost: 0.3, expired: 0 };

export function scan(query) {
  const root = getStoreRoot();
  const index = readIndex(root);
  const qTokens = termFreq(tokenize(query));

  // 按 domain 聚合
  const domains = {};
  for (const entry of index) {
    if (entry.tier === 'expired') continue;
    const d = entry.domain || 'uncategorized';
    if (!domains[d]) domains[d] = { domain: d, count: 0, latest: null, maxScore: 0 };
    domains[d].count++;

    const entryText = `${entry.summary || ''} ${entry.domain || ''} ${entry.type || ''}`;
    const eTokens = termFreq(tokenize(entryText));
    const score = cosineSim(qTokens, eTokens) * (TIER_WEIGHT[entry.tier] || 0.5);

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
    // fresh/recent: 返回完整 body
    if (e.tier === 'fresh' || e.tier === 'recent') {
      const full = readMemory(e.id, root);
      if (full) result.body = full.body;
    }
    // faded: 只返回 summary（已在 index 中）
    // ghost: 只返回一行索引
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
    const entryText = `${entry.summary || ''} ${entry.domain || ''} ${entry.type || ''}`;
    const eTokens = termFreq(tokenize(entryText));
    const score = cosineSim(qTokens, eTokens) * (TIER_WEIGHT[entry.tier] || 0.5);
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
