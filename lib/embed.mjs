// embed.mjs — 语义 embedding 层（Qwen3-Embedding-8B via 302.ai）
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readIndex, getStoreRoot } from './store.mjs';

const API_BASE = 'https://api.302.ai/v1';
const API_KEY = 'sk-yy9pD3ZweLJlO4qtHMPwoA7VcL8g9aLQVJlgkKqzh8WbtrdC';
const MODEL = 'Qwen/Qwen3-Embedding-8B';

function embeddingsPath(root) {
  return join(root, 'embeddings.json');
}

function loadEmbeddings(root) {
  const p = embeddingsPath(root);
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, 'utf8'));
}

function saveEmbeddings(data, root) {
  writeFileSync(embeddingsPath(root), JSON.stringify(data), 'utf8');
}

async function embedTexts(texts) {
  const resp = await fetch(`${API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Embedding API error ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return data.data.map(d => d.embedding);
}

// 给所有记忆建索引
export async function buildIndex() {
  const root = getStoreRoot();
  const index = readIndex(root);
  const existing = loadEmbeddings(root);

  const toEmbed = index.filter(e => !existing[e.id]);
  if (toEmbed.length === 0) {
    console.log(`✅ All ${index.length} memories already embedded.`);
    return;
  }

  console.log(`🔄 Embedding ${toEmbed.length} new memories (${Object.keys(existing).length} cached)...`);

  const texts = toEmbed.map(e => `[${e.domain}] [${e.type}] ${e.summary}`);

  const BATCH = 32;
  let done = 0;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const vecs = await embedTexts(batch);
    for (let j = 0; j < vecs.length; j++) {
      existing[toEmbed[i + j].id] = vecs[j];
    }
    done += batch.length;
    if (texts.length > BATCH) process.stdout.write(`  ${done}/${texts.length}\r`);
  }

  saveEmbeddings(existing, root);
  console.log(`✅ Embedded ${toEmbed.length} memories. Total: ${Object.keys(existing).length}`);
}

// 语义搜索
export async function semanticSearch(query, limit = 5) {
  const root = getStoreRoot();
  const index = readIndex(root);
  const embeddings = loadEmbeddings(root);

  const qVecs = await embedTexts([query]);
  const qVec = qVecs[0];

  const scored = [];
  for (const entry of index) {
    if (entry.tier === 'expired') continue;
    const eVec = embeddings[entry.id];
    if (!eVec) continue;

    const sim = cosine(qVec, eVec);
    const tierW = { fresh: 1.0, recent: 0.9, faded: 0.7, ghost: 0.4 }[entry.tier] || 0.5;
    scored.push({ ...entry, score: sim * tierW, rawSim: sim });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function cosine(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
