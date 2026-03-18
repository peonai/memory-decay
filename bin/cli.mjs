#!/usr/bin/env node
// CLI entry point
import { Command } from 'commander';
import { v4 as uuid } from 'uuid';
import { ensureDirs, readIndex, getStoreRoot, writeMemory as storeWrite, countFiles } from '../lib/store.mjs';
import { runDecay } from '../lib/decay.mjs';
import { scan as doScan, focus as doFocus, search as doSearch } from '../lib/search.mjs';
import { displaySummary } from '../lib/compress.mjs';

const program = new Command();
program.name('memory-decay').description('Human-like fuzzy memory with gradient decay').version('0.1.0');

// ── write ──
program
  .command('write')
  .description('Write a new memory')
  .requiredOption('-t, --type <type>', 'decision|experiment|reference|status|temporary')
  .requiredOption('-d, --domain <domain>', 'Domain tag (e.g. payment, blog)')
  .requiredOption('-s, --summary <summary>', 'One-line summary')
  .option('--ttl <ttl>', 'TTL: 3d|7d|30d|permanent', '30d')
  .option('-c, --confidence <n>', 'Confidence 0.0-1.0', '0.8')
  .option('-b, --body <body>', 'Full body text')
  .action((opts) => {
    const root = ensureDirs();
    const entry = {
      id: uuid(),
      created: new Date().toISOString(),
      type: opts.type,
      domain: opts.domain,
      summary: opts.summary,
      ttl: opts.ttl,
      confidence: parseFloat(opts.confidence),
      tier: 'fresh',
    };
    storeWrite(entry, opts.body || opts.summary, root);
    console.log(`✅ Written: [${entry.type}] ${entry.summary}`);
    console.log(`   id: ${entry.id} | domain: ${entry.domain} | ttl: ${entry.ttl} | tier: fresh`);
  });

// ── scan ──
program
  .command('scan <query>')
  .description('Fuzzy scan — which domains match?')
  .action((query) => {
    const results = doScan(query);
    if (results.length === 0) {
      console.log('🔍 No matching domains found.');
      return;
    }
    console.log('🔍 Matching domains:\n');
    for (const d of results) {
      const date = d.latest ? d.latest.slice(0, 10) : '?';
      console.log(`  📁 ${d.domain} (${d.count} memories, latest: ${date}, relevance: ${(d.maxScore * 100).toFixed(0)}%)`);
    }
    console.log(`\nUse: memory-decay focus <domain> to drill down.`);
  });

// ── focus ──
program
  .command('focus <domain>')
  .description('Focus on a domain — show memories by tier')
  .action((domain) => {
    const entries = doFocus(domain);
    if (entries.length === 0) {
      console.log(`📁 No memories in domain "${domain}".`);
      return;
    }
    console.log(`📁 ${domain} — ${entries.length} memories:\n`);
    for (const e of entries) {
      const date = e.created.slice(0, 10);
      const tierIcon = { fresh: '🟢', recent: '🔵', faded: '🟡', ghost: '👻' }[e.tier] || '⚪';
      if (e.tier === 'ghost') {
        console.log(`  ${tierIcon} [ghost] ${date}: ${e.summary}`);
      } else if (e.tier === 'faded') {
        console.log(`  ${tierIcon} [faded] ${date}: ${e.summary}`);
      } else {
        console.log(`  ${tierIcon} [${e.tier}] ${date}: ${e.summary}`);
        if (e.body) console.log(`     ${e.body.slice(0, 200)}${e.body.length > 200 ? '...' : ''}`);
      }
    }
  });

// ── search ──
program
  .command('search <query>')
  .description('Keyword search — top-k matching memories')
  .option('-n, --limit <n>', 'Max results', '5')
  .action((query, opts) => {
    const results = doSearch(query, parseInt(opts.limit));
    if (results.length === 0) {
      console.log('🔍 No matches.');
      return;
    }
    console.log(`🔍 Top ${results.length} results:\n`);
    for (const e of results) {
      const date = e.created.slice(0, 10);
      const tierIcon = { fresh: '🟢', recent: '🔵', faded: '🟡', ghost: '👻' }[e.tier] || '⚪';
      const displayText = displaySummary(e.summary, e.tier);
      console.log(`  ${tierIcon} [${e.tier}] ${date} | ${e.domain} | ${displayText} (score: ${(e.score * 100).toFixed(0)}%)`);
      if (e.body && (e.tier === 'fresh' || e.tier === 'recent')) {
        console.log(`     ${e.body.slice(0, 200)}${e.body.length > 200 ? '...' : ''}`);
      } else if (e.tier === 'faded') {
        console.log(`     [detailed content archived]`);
      }
    }
  });

// ── decay ──
program
  .command('decay')
  .description('Run decay — demote memories by age')
  .option('--dry-run', 'Preview changes without applying')
  .action(async (opts) => {
    ensureDirs();
    const changes = await runDecay(opts.dryRun);
    if (changes.length === 0) {
      console.log('✅ No decay needed — all memories at correct tier.');
      return;
    }
    console.log(opts.dryRun ? '🔍 Dry run — would change:\n' : '⏳ Decay applied:\n');
    for (const c of changes) {
      console.log(`  ${c.summary} [${c.domain}]: ${c.from} → ${c.to}`);
    }
    console.log(`\n${changes.length} memories ${opts.dryRun ? 'would be' : ''} updated.`);
  });

// ── stats ──
program
  .command('stats')
  .description('Memory statistics')
  .action(() => {
    ensureDirs();
    const index = readIndex();
    const tiers = {};
    const domains = {};
    const types = {};
    for (const e of index) {
      tiers[e.tier] = (tiers[e.tier] || 0) + 1;
      domains[e.domain] = (domains[e.domain] || 0) + 1;
      types[e.type] = (types[e.type] || 0) + 1;
    }
    console.log(`📊 Memory Stats\n`);
    console.log(`Total: ${index.length} memories`);
    console.log(`Files: fresh=${countFiles('fresh')}, archive=${countFiles('archive')}, expired=${countFiles('expired')}`);
    console.log(`\nBy tier:`);
    for (const [t, n] of Object.entries(tiers)) console.log(`  ${t}: ${n}`);
    console.log(`\nBy domain:`);
    for (const [d, n] of Object.entries(domains).sort((a, b) => b[1] - a[1])) console.log(`  ${d}: ${n}`);
    console.log(`\nBy type:`);
    for (const [t, n] of Object.entries(types)) console.log(`  ${t}: ${n}`);
  });

program.parse();
