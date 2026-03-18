// hybrid.mjs — 混合检索：关键词 + 语义融合
import { readIndex, readMemory, getStoreRoot } from './store.mjs';
import { search as keywordSearch } from './search.mjs';
import { semanticSearch } from './embed.mjs';

// Reciprocal Rank Fusion (RRF)
// 每个结果按排名给分：score = 1/(k+rank)，然后合并
function rrf(lists, k = 60) {
  const scores = {};
  const entries = {};

  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i].id;
      if (!scores[id]) scores[id] = 0;
      scores[id] += 1 / (k + i + 1);
      entries[id] = list[i];
    }
  }

  return Object.entries(scores)
    .map(([id, score]) => ({ ...entries[id], hybridScore: score }))
    .sort((a, b) => b.hybridScore - a.hybridScore);
}

// 加权分数融合（Weighted Score Fusion）
// 归一化两组分数后加权合并
function weightedFusion(kwResults, semResults, kwWeight = 0.4, semWeight = 0.6) {
  // 归一化
  const kwMax = kwResults.length > 0 ? Math.max(...kwResults.map(r => r.score)) : 1;
  const semMax = semResults.length > 0 ? Math.max(...semResults.map(r => r.score)) : 1;

  const scores = {};
  const entries = {};

  for (const r of kwResults) {
    scores[r.id] = { kw: (r.score / kwMax) * kwWeight, sem: 0 };
    entries[r.id] = r;
  }
  for (const r of semResults) {
    if (!scores[r.id]) scores[r.id] = { kw: 0, sem: 0 };
    scores[r.id].sem = (r.score / semMax) * semWeight;
    entries[r.id] = { ...entries[r.id], ...r, rawSim: r.rawSim };
  }

  return Object.entries(scores)
    .map(([id, s]) => ({
      ...entries[id],
      hybridScore: s.kw + s.sem,
      kwNorm: s.kw,
      semNorm: s.sem,
    }))
    .sort((a, b) => b.hybridScore - a.hybridScore);
}

export async function hybridSearch(query, limit = 5) {
  // 两路检索，各取 top-20 候选
  const kwResults = keywordSearch(query, 20);
  const semResults = await semanticSearch(query, 20);

  // 加权融合
  const fused = weightedFusion(kwResults, semResults, 0.4, 0.6);

  return fused.slice(0, limit).map(r => {
    const result = { ...r };
    // fresh/recent 返回 body
    if (r.tier === 'fresh' || r.tier === 'recent') {
      const root = getStoreRoot();
      const full = readMemory(r.id, root);
      if (full) result.body = full.body;
    }
    return result;
  });
}
