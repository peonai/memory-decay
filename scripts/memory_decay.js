#!/usr/bin/env node
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const STORE = join(process.cwd(), 'store');
const VALID_TYPES = new Set(['decision', 'experiment', 'reference', 'status', 'temporary']);
const VALID_TTLS = new Set(['3d', '7d', '30d', 'permanent']);
const TIER_WEIGHT = { fresh: 1.0, recent: 0.85, faded: 0.6, ghost: 0.3, expired: 0 };

function ensureDirs(root = STORE) {
  for (const d of ['fresh', 'archive', 'expired']) mkdirSync(join(root, d), { recursive: true });
  const idx = join(root, 'index.json');
  if (!existsSync(idx)) writeFileSync(idx, '[]\n', 'utf8');
  return root;
}

function readIndex(root = STORE) {
  const idx = join(root, 'index.json');
  if (!existsSync(idx)) return [];
  return JSON.parse(readFileSync(idx, 'utf8'));
}

function writeIndex(entries, root = STORE) {
  writeFileSync(join(root, 'index.json'), JSON.stringify(entries, null, 2) + '\n', 'utf8');
}

function storageDirForTier(tier) {
  return tier === 'expired' ? 'expired' : (tier === 'ghost' || tier === 'faded') ? 'archive' : 'fresh';
}

function writeMemory(entry, body, root = STORE) {
  ensureDirs(root);
  const file = join(root, storageDirForTier(entry.tier), `${entry.id}.json`);
  writeFileSync(file, JSON.stringify({ ...entry, body }, null, 2) + '\n', 'utf8');
  const index = readIndex(root);
  const i = index.findIndex((e) => e.id === entry.id);
  if (i >= 0) index[i] = { ...entry };
  else index.push({ ...entry });
  writeIndex(index, root);
}

function readMemory(id, root = STORE) {
  for (const dir of ['fresh', 'archive', 'expired']) {
    const file = join(root, dir, `${id}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  }
  return null;
}

function moveMemory(id, fromDir, toDir, root = STORE) {
  const src = join(root, fromDir, `${id}.json`);
  const dst = join(root, toDir, `${id}.json`);
  if (existsSync(src) && src !== dst) renameSync(src, dst);
}

function countFiles(dir, root = STORE) {
  const p = join(root, dir);
  if (!existsSync(p)) return 0;
  return readdirSync(p).filter((f) => f.endsWith('.json')).length;
}

function parseTTL(ttl) {
  if (ttl === 'permanent') return Infinity;
  const m = String(ttl || '').match(/^(\d+)d$/);
  return m ? parseInt(m[1], 10) * 86400000 : 30 * 86400000;
}

function ageDays(created) {
  return (Date.now() - new Date(created).getTime()) / 86400000;
}

function tierForAge(days) {
  if (days <= 3) return 'fresh';
  if (days <= 14) return 'recent';
  if (days <= 30) return 'faded';
  return 'ghost';
}

function computeDecay(entry) {
  if (entry.ttl === 'permanent') return entry.tier || 'fresh';
  const days = ageDays(entry.created);
  const ttlDays = parseTTL(entry.ttl || '30d') / 86400000;
  if (days > ttlDays) return 'expired';
  return tierForAge(days);
}

function runDecay(dryRun = false) {
  const index = readIndex(STORE);
  const changes = [];
  for (const entry of index) {
    const next = computeDecay(entry);
    if (next !== entry.tier) {
      changes.push({ id: entry.id, summary: entry.summary, domain: entry.domain, from: entry.tier, to: next });
      if (!dryRun) {
        const oldDir = storageDirForTier(entry.tier);
        const newDir = storageDirForTier(next);
        if (oldDir !== newDir) moveMemory(entry.id, oldDir, newDir, STORE);
        entry.tier = next;
      }
    }
  }
  if (!dryRun) writeIndex(index, STORE);
  return changes;
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
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const t in a) {
    magA += a[t] ** 2;
    if (b[t]) dot += a[t] * b[t];
  }
  for (const t in b) magB += b[t] ** 2;
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function loadDomainAliases() {
  const configPath = join(STORE, 'config.json');
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')).domainAliases || {};
  } catch {
    return {};
  }
}

function domainAliasBoost(query, domain) {
  const aliases = loadDomainAliases()[domain];
  if (!aliases) return 0;
  const q = query.toLowerCase();
  let boost = 0;
  for (const alias of aliases) {
    if (q.includes(String(alias).toLowerCase())) boost += 0.4;
  }
  return Math.min(boost, 0.8);
}

function scoreEntry(qTokens, entry, query) {
  const summaryScore = cosineSim(qTokens, termFreq(tokenize(entry.summary || '')));
  const domainScore = cosineSim(qTokens, termFreq(tokenize(entry.domain || ''))) * 3;
  const aliasBoost = domainAliasBoost(query, entry.domain);
  const tierW = TIER_WEIGHT[entry.tier] || 0.5;
  return (summaryScore + domainScore + aliasBoost) * tierW;
}

function displaySummary(summary, tier) {
  if (tier === 'ghost') return `[archived] ${summary.slice(0, 15)}...`;
  return summary;
}

function search(query, limit = 5) {
  const index = readIndex(STORE);
  const qTokens = termFreq(tokenize(query));
  const scored = [];
  for (const entry of index) {
    if (entry.tier === 'expired') continue;
    const score = scoreEntry(qTokens, entry, query);
    if (score > 0) scored.push({ ...entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((e) => {
    const result = { ...e };
    if (e.tier === 'fresh' || e.tier === 'recent') {
      const full = readMemory(e.id, STORE);
      if (full) result.body = full.body;
    }
    return result;
  });
}

function scan(query) {
  const index = readIndex(STORE);
  const qTokens = termFreq(tokenize(query));
  const domains = {};
  for (const entry of index) {
    if (entry.tier === 'expired') continue;
    const domain = entry.domain || 'uncategorized';
    if (!domains[domain]) domains[domain] = { domain, count: 0, latest: null, maxScore: 0 };
    domains[domain].count++;
    const score = scoreEntry(qTokens, entry, query);
    if (score > domains[domain].maxScore) domains[domain].maxScore = score;
    if (!domains[domain].latest || new Date(entry.created) > new Date(domains[domain].latest)) {
      domains[domain].latest = entry.created;
    }
  }
  return Object.values(domains).filter((d) => d.maxScore > 0).sort((a, b) => b.maxScore - a.maxScore);
}

function focus(domain) {
  return readIndex(STORE)
    .filter((e) => e.domain === domain && e.tier !== 'expired')
    .sort((a, b) => new Date(b.created) - new Date(a.created))
    .map((e) => {
      const result = { ...e };
      if (e.tier === 'fresh' || e.tier === 'recent') {
        const full = readMemory(e.id, STORE);
        if (full) result.body = full.body;
      }
      return result;
    });
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else if (a.startsWith('-')) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function validateWrite(opts) {
  const type = opts.type || opts.t;
  const domain = opts.domain || opts.d;
  const summary = opts.summary || opts.s;
  const ttl = opts.ttl || '30d';
  const confidence = parseFloat(opts.confidence || opts.c || '0.8');
  if (!VALID_TYPES.has(type)) fail(`Invalid type: ${type}`);
  if (!domain || !/^[a-z0-9_-]+$/i.test(domain)) fail('Domain is required and should be a simple tag.');
  if (!summary || summary.trim().length < 5) fail('Summary is required.');
  if (!VALID_TTLS.has(ttl)) fail(`Invalid ttl: ${ttl}`);
  if (Number.isNaN(confidence) || confidence < 0 || confidence > 1) fail('Confidence must be between 0.0 and 1.0.');
  return { type, domain, summary: summary.trim(), ttl, confidence, body: opts.body || opts.b || summary };
}

function printHelp() {
  console.log(`memory_decay.js commands:\n  write --type decision --domain infra --summary "..." [--ttl 30d] [--confidence 0.8] [--body "..."]\n  search <query> [--limit 5]\n  scan <query>\n  focus <domain>\n  decay [--dry-run]\n  stats`);
}

ensureDirs(STORE);
const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  printHelp();
} else if (cmd === 'write') {
  const opts = validateWrite(parseArgs(rest));
  const entry = {
    id: randomUUID(),
    created: new Date().toISOString(),
    type: opts.type,
    domain: opts.domain,
    summary: opts.summary,
    ttl: opts.ttl,
    confidence: opts.confidence,
    tier: 'fresh',
  };
  writeMemory(entry, opts.body, STORE);
  console.log(`Written: [${entry.type}] ${entry.summary}`);
  console.log(`id: ${entry.id} | domain: ${entry.domain} | ttl: ${entry.ttl} | tier: fresh`);
} else if (cmd === 'search') {
  const args = parseArgs(rest);
  const query = args._[0];
  if (!query) fail('Query required.');
  const limit = parseInt(args.limit || args.n || '5', 10);
  const results = search(query, limit);
  if (!results.length) console.log('No matches.');
  for (const e of results) {
    console.log(`[${e.tier}] ${e.created.slice(0, 10)} | ${e.domain} | ${displaySummary(e.summary, e.tier)} | ${(e.score * 100).toFixed(0)}%`);
    if (e.body && (e.tier === 'fresh' || e.tier === 'recent')) {
      console.log(`  ${String(e.body).slice(0, 200)}${String(e.body).length > 200 ? '...' : ''}`);
    }
  }
} else if (cmd === 'scan') {
  const args = parseArgs(rest);
  const query = args._[0];
  if (!query) fail('Query required.');
  const results = scan(query);
  if (!results.length) console.log('No matching domains found.');
  for (const d of results) {
    console.log(`${d.domain} (${d.count} memories, latest: ${(d.latest || '?').slice(0, 10)}, relevance: ${(d.maxScore * 100).toFixed(0)}%)`);
  }
} else if (cmd === 'focus') {
  const args = parseArgs(rest);
  const domain = args._[0];
  if (!domain) fail('Domain required.');
  const results = focus(domain);
  if (!results.length) console.log(`No memories in domain "${domain}".`);
  for (const e of results) {
    console.log(`[${e.tier}] ${e.created.slice(0, 10)}: ${e.summary}`);
    if (e.body) console.log(`  ${String(e.body).slice(0, 200)}${String(e.body).length > 200 ? '...' : ''}`);
  }
} else if (cmd === 'decay') {
  const args = parseArgs(rest);
  const changes = runDecay(Boolean(args['dry-run']));
  if (!changes.length) console.log('No decay needed.');
  for (const c of changes) {
    console.log(`${c.summary} [${c.domain}]: ${c.from} -> ${c.to}`);
  }
} else if (cmd === 'stats') {
  const index = readIndex(STORE);
  const tiers = {};
  const domains = {};
  const types = {};
  for (const e of index) {
    tiers[e.tier] = (tiers[e.tier] || 0) + 1;
    domains[e.domain] = (domains[e.domain] || 0) + 1;
    types[e.type] = (types[e.type] || 0) + 1;
  }
  console.log(`Total: ${index.length}`);
  console.log(`Files: fresh=${countFiles('fresh')}, archive=${countFiles('archive')}, expired=${countFiles('expired')}`);
  console.log('By tier:');
  for (const [k, v] of Object.entries(tiers)) console.log(`  ${k}: ${v}`);
  console.log('By domain:');
  for (const [k, v] of Object.entries(domains).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  console.log('By type:');
  for (const [k, v] of Object.entries(types)) console.log(`  ${k}: ${v}`);
} else {
  fail(`Unknown command: ${cmd}`);
}
