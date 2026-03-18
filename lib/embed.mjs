// embed.mjs — Semantic embedding layer (OpenAI-compatible API)
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readIndex, getStoreRoot } from './store.mjs';

const API_BASE = process.env.EMBED_API_BASE || 'https://api.openai.com/v1';
const API_KEY = process.env.EMBED_API_KEY || '';
const MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';

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
  if (!API_KEY) {
    throw new Error('EMBED_API_KEY not set. Export it or skip semantic search.');
  }
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

// Build embedding index for all memories
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

// Semantic search via cosine similarity
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
