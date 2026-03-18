#!/usr/bin/env node
// CLI 入口
import { Command } from 'commander';
import { v4 as uuid } from 'uuid';
import { ensureDirs, readIndex, getStoreRoot, writeMemory as storeWrite, countFiles } from '../lib/store.mjs';
import { runDecay } from '../lib/decay.mjs';
import { scan as doScan, focus as doFocus, search as doSearch } from '../lib/search.mjs';

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
  .description('Direct search — top-k matching memories')
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
      console.log(`  ${tierIcon} [${e.tier}] ${date} | ${e.domain} | ${e.summary} (score: ${(e.score * 100).toFixed(0)}%)`);
      if (e.body && (e.tier === 'fresh' || e.tier === 'recent')) {
        console.log(`     ${e.body.slice(0, 200)}${e.body.length > 200 ? '...' : ''}`);
      }
    }
  });

// ── decay ──
program
  .command('decay')
  .description('Run decay — compress memories by age')
  .option('--dry-run', 'Preview changes without applying')
  .action((opts) => {
    ensureDirs();
    const changes = runDecay(opts.dryRun);
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

// ── seed ──
program
  .command('seed')
  .description('Seed test memories for demo')
  .action(() => {
    ensureDirs();
    const seeds = [
      { type: 'decision', domain: 'payment', summary: 'Creem 作为支付平台，不用 Stripe', ttl: 'permanent', confidence: 0.95, body: '选择 Creem 因为：1) 国内友好 2) API 简洁 3) 支持 test mode。Stripe 需要海外实体。', daysAgo: 0 },
      { type: 'experiment', domain: 'payment', summary: '试了 LemonSqueezy，体验一般', ttl: '7d', confidence: 0.4, body: 'LemonSqueezy 注册流程太长，dashboard 慢，放弃。', daysAgo: 5 },
      { type: 'reference', domain: 'payment', summary: 'Creem test API: https://test-api.creem.io', ttl: '30d', confidence: 0.9, body: 'Test key: creem_test_xxx, Live key: creem_xxx。文档在 docs.creem.io/llms.txt', daysAgo: 10 },
      { type: 'decision', domain: 'blog', summary: '博客双语方案：中文 .md + 英文 .en.md', ttl: 'permanent', confidence: 0.95, body: 'Hugo i18n 原生支持，defaultContentLanguage = zh，英文用 .en.md 后缀。', daysAgo: 2 },
      { type: 'status', domain: 'blog', summary: 'peon.blog 移动端布局已修复', ttl: '7d', confidence: 0.9, body: 'newspaper.css 760px 断点，标题 clamp 降到 1.8rem，副栏 line-clamp 5。', daysAgo: 0 },
      { type: 'temporary', domain: 'infra', summary: '试了把落地页放 /tmp/landing-test/', ttl: '3d', confidence: 0.3, body: '结构不对，目录已废弃。', daysAgo: 8 },
      { type: 'decision', domain: 'infra', summary: 'LLM Gateway 部署在本地 3456 端口', ttl: 'permanent', confidence: 0.95, body: 'pm2 管理，ecosystem.config.cjs 含 ADMIN_KEY。', daysAgo: 20 },
      { type: 'experiment', domain: 'chrome-ext', summary: 'Side-by-Side Translator Pro 档位定价 $4.99/月', ttl: '30d', confidence: 0.7, body: '参考竞品定价，Pro 功能包括：无限翻译、自定义模型、导出。', daysAgo: 16 },
      { type: 'reference', domain: 'infra', summary: 'fonts.loli.net 已挂，换 fonts.bunny.net', ttl: '30d', confidence: 0.9, body: 'loli.net 返回 content-length:0。Bunny Fonts 是 Google Fonts 隐私替代，亚洲有节点。', daysAgo: 1 },
      { type: 'status', domain: 'chrome-ext', summary: 'YouTube Bookmarker 等待 Chrome Web Store 审核', ttl: '7d', confidence: 0.8, body: '提交于 3月15日，通常 3-5 个工作日。', daysAgo: 35 },
    ];

    for (const s of seeds) {
      const created = new Date(Date.now() - s.daysAgo * 86400000).toISOString();
      const entry = {
        id: uuid(),
        created,
        type: s.type,
        domain: s.domain,
        summary: s.summary,
        ttl: s.ttl,
        confidence: s.confidence,
        tier: 'fresh', // decay 会修正
      };
      storeWrite(entry, s.body);
    }
    console.log(`🌱 Seeded ${seeds.length} test memories.`);
    console.log('Run `memory-decay decay` to apply tier assignments.');
  });

program.parse();
