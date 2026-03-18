// hybrid.mjs — Hybrid retrieval: keyword + semantic fusion
import { readIndex, readMemory, getStoreRoot } from './store.mjs';
import { search as keywordSearch } from './search.mjs';
import { semanticSearch } from './embed.mjs';

// Weighted Score Fusion
// Normalize both score sets, then combine with weights
function weightedFusion(kwResults, semResults, kwWeight = 0.4, semWeight = 0.6) {
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
  // Two-way retrieval, top-20 candidates each
  const kwResults = keywordSearch(query, 20);
  const semResults = await semanticSearch(query, 20);

  const fused = weightedFusion(kwResults, semResults, 0.4, 0.6);

  return fused.slice(0, limit).map(r => {
    const result = { ...r };
    // fresh/recent: return full body
    if (r.tier === 'fresh' || r.tier === 'recent') {
      const root = getStoreRoot();
      const full = readMemory(r.id, root);
      if (full) result.body = full.body;
    }
    return result;
  });
}
