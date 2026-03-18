// decay.mjs — 衰减引擎
import { readIndex, writeIndex, readMemory, writeMemory, moveMemory, getStoreRoot } from './store.mjs';
import { compress } from './compress.mjs';

const TIER_ORDER = ['fresh', 'recent', 'faded', 'ghost', 'expired'];

function parseTTL(ttl) {
  if (ttl === 'permanent') return Infinity;
  const m = ttl.match(/^(\d+)d$/);
  return m ? parseInt(m[1]) * 86400000 : 30 * 86400000; // default 30d
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

export function computeDecay(entry) {
  // permanent 不衰减
  if (entry.ttl === 'permanent') return entry.tier || 'fresh';

  const days = ageDays(entry.created);
  const ttlMs = parseTTL(entry.ttl || '30d');
  const ttlDays = ttlMs / 86400000;

  // 超过 ttl → expired
  if (days > ttlDays) return 'expired';

  return tierForAge(days);
}

export async function runDecay(dryRun = false) {
  const root = getStoreRoot();
  const index = readIndex(root);
  const changes = [];

  for (const entry of index) {
    const newTier = computeDecay(entry);
    if (newTier !== entry.tier) {
      changes.push({ id: entry.id, summary: entry.summary, domain: entry.domain, from: entry.tier, to: newTier });

      if (!dryRun) {
        // 移动到归档目录
        const oldDir = entry.tier === 'expired' ? 'expired' : (entry.tier === 'ghost' || entry.tier === 'faded') ? 'archive' : 'fresh';
        const newDir = newTier === 'expired' ? 'expired' : (newTier === 'ghost' || newTier === 'faded') ? 'archive' : 'fresh';
        if (oldDir !== newDir) moveMemory(entry.id, oldDir, newDir, root);

        // 语义压缩：faded/ghost 层压缩 summary
        if ((newTier === 'faded' || newTier === 'ghost') && entry.tier !== newTier) {
          console.log(`🗜️  Compressing ${entry.id} (${entry.tier} → ${newTier})...`);
          const body = readMemory(entry.id, newDir, root);
          const compressed = await compress(entry.summary, newTier);
          entry.summary = compressed;
        }

        entry.tier = newTier;
      }
    }
  }

  if (!dryRun) writeIndex(index, root);
  return changes;
}
