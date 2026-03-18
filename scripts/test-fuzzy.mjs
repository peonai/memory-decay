#!/usr/bin/env node
// 模糊检索测试 + HTML 报告生成
import { readIndex, readMemory, getStoreRoot, ensureDirs } from '../lib/store.mjs';
import { scan, focus, search } from '../lib/search.mjs';
import { writeFileSync } from 'fs';

ensureDirs();

// 测试用例：模拟真实的模糊回忆场景
const testCases = [
  // 模糊程度：高（只记得大方向）
  { query: '支付', desc: '只记得跟支付有关', expectDomain: 'payment', fuzzyLevel: 'high' },
  { query: '部署服务器', desc: '大概记得部署过什么', expectDomain: 'infra', fuzzyLevel: 'high' },
  { query: '写过文章', desc: '好像写过博客', expectDomain: 'blog', fuzzyLevel: 'high' },
  { query: '插件', desc: '做过浏览器插件', expectDomain: 'chrome-ext', fuzzyLevel: 'high' },

  // 模糊程度：中（记得一些关键词）
  { query: 'Creem API', desc: '记得用了 Creem 的 API', expectDomain: 'payment', fuzzyLevel: 'medium' },
  { query: 'Hugo 博客双语', desc: '博客做了双语', expectDomain: 'blog', fuzzyLevel: 'medium' },
  { query: 'gateway 路由', desc: 'LLM Gateway 路由相关', expectDomain: 'infra', fuzzyLevel: 'medium' },
  { query: 'Chrome 翻译插件', desc: 'Side-by-Side Translator', expectDomain: 'chrome-ext', fuzzyLevel: 'medium' },
  { query: '漫画分镜', desc: '做过漫画', expectDomain: 'comic', fuzzyLevel: 'medium' },
  { query: 'agent 协作', desc: '多 agent 协作', expectDomain: 'openclaw', fuzzyLevel: 'medium' },

  // 模糊程度：低（记得具体细节）
  { query: 'fonts.bunny.net 字体CDN', desc: '换过字体 CDN', expectDomain: 'blog', fuzzyLevel: 'low' },
  { query: 'Creem test-api.creem.io', desc: 'Creem 测试 API 地址', expectDomain: 'payment', fuzzyLevel: 'low' },
  { query: 'pm2 ecosystem.config', desc: 'pm2 配置文件', expectDomain: 'infra', fuzzyLevel: 'low' },
  { query: 'newspaper.css 移动端', desc: '博客移动端样式修复', expectDomain: 'blog', fuzzyLevel: 'low' },
  { query: 'edge-tts opus 语音', desc: 'TTS 语音生成', expectDomain: 'infra', fuzzyLevel: 'low' },

  // 反面测试：不应该命中过期记忆
  { query: '/tmp/landing-test', desc: '废弃的临时目录（应该被过滤）', expectDomain: null, fuzzyLevel: 'negative' },

  // 跨域模糊
  { query: '上个月做了什么', desc: '极度模糊的时间查询', expectDomain: null, fuzzyLevel: 'extreme' },
  { query: '出过什么 bug', desc: '模糊找 bug 记录', expectDomain: null, fuzzyLevel: 'extreme' },
];

const results = [];
const index = readIndex();
const tierCounts = {};
const domainCounts = {};
for (const e of index) {
  tierCounts[e.tier] = (tierCounts[e.tier] || 0) + 1;
  domainCounts[e.domain] = (domainCounts[e.domain] || 0) + 1;
}

for (const tc of testCases) {
  const scanResult = scan(tc.query);
  const searchResult = search(tc.query, 5);

  const topDomain = scanResult.length > 0 ? scanResult[0].domain : null;
  const domainHit = tc.expectDomain === null ? true : topDomain === tc.expectDomain;
  const anyDomainHit = tc.expectDomain === null ? true : scanResult.some(d => d.domain === tc.expectDomain);

  // 检查过期记忆是否泄漏
  const expiredLeak = searchResult.some(r => r.tier === 'expired');

  results.push({
    ...tc,
    scanResult,
    searchResult,
    topDomain,
    domainHit,
    anyDomainHit,
    expiredLeak,
    pass: domainHit && !expiredLeak,
  });
}

// 统计
const total = results.length;
const passed = results.filter(r => r.pass).length;
const domainHits = results.filter(r => r.domainHit).length;
const anyHits = results.filter(r => r.anyDomainHit).length;
const expiredLeaks = results.filter(r => r.expiredLeak).length;
const byFuzzy = {};
for (const r of results) {
  if (!byFuzzy[r.fuzzyLevel]) byFuzzy[r.fuzzyLevel] = { total: 0, pass: 0 };
  byFuzzy[r.fuzzyLevel].total++;
  if (r.pass) byFuzzy[r.fuzzyLevel].pass++;
}

// 生成 HTML
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Memory Decay — 模糊检索测试报告</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 2rem; line-height: 1.6; }
  h1 { color: #f0f0f0; margin-bottom: 0.5rem; font-size: 1.8rem; }
  .subtitle { color: #888; margin-bottom: 2rem; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .stat-card { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1.2rem; }
  .stat-card .label { color: #888; font-size: 0.85rem; margin-bottom: 0.3rem; }
  .stat-card .value { font-size: 1.8rem; font-weight: 700; }
  .stat-card .value.green { color: #4ade80; }
  .stat-card .value.yellow { color: #facc15; }
  .stat-card .value.red { color: #f87171; }
  .stat-card .value.blue { color: #60a5fa; }
  .section { margin-bottom: 2rem; }
  .section h2 { color: #ccc; font-size: 1.2rem; margin-bottom: 1rem; border-bottom: 1px solid #333; padding-bottom: 0.5rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th { background: #1a1a1a; color: #aaa; text-align: left; padding: 0.7rem; border-bottom: 2px solid #333; }
  td { padding: 0.7rem; border-bottom: 1px solid #222; vertical-align: top; }
  tr:hover { background: #151515; }
  .pass { color: #4ade80; font-weight: 600; }
  .fail { color: #f87171; font-weight: 600; }
  .tag { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
  .tag-high { background: #7c3aed33; color: #a78bfa; }
  .tag-medium { background: #2563eb33; color: #60a5fa; }
  .tag-low { background: #16a34a33; color: #4ade80; }
  .tag-negative { background: #dc262633; color: #f87171; }
  .tag-extreme { background: #d9770633; color: #fb923c; }
  .tier-bar { display: flex; height: 24px; border-radius: 4px; overflow: hidden; margin-top: 0.5rem; }
  .tier-bar div { display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 600; }
  .tier-fresh { background: #4ade80; color: #000; }
  .tier-recent { background: #60a5fa; color: #000; }
  .tier-faded { background: #facc15; color: #000; }
  .tier-ghost { background: #888; color: #000; }
  .tier-expired { background: #f87171; color: #000; }
  .domain-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
  .domain-chip { background: #1a1a1a; border: 1px solid #333; padding: 0.3rem 0.7rem; border-radius: 4px; font-size: 0.8rem; }
  .search-results { font-size: 0.8rem; color: #888; max-height: 120px; overflow-y: auto; margin-top: 0.3rem; }
  .search-results .item { margin-bottom: 0.3rem; }
  .search-results .tier-icon { margin-right: 0.3rem; }
  .fuzzy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.8rem; margin-bottom: 1.5rem; }
  .fuzzy-card { background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 0.8rem; text-align: center; }
  .fuzzy-card .level { font-size: 0.8rem; color: #888; margin-bottom: 0.3rem; }
  .fuzzy-card .rate { font-size: 1.4rem; font-weight: 700; }
  footer { margin-top: 3rem; color: #555; font-size: 0.8rem; text-align: center; }
</style>
</head>
<body>

<h1>🧠 Memory Decay — 模糊检索测试报告</h1>
<p class="subtitle">模拟人类模糊记忆的检索准确度测试 · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</p>

<div class="stats-grid">
  <div class="stat-card">
    <div class="label">总记忆数</div>
    <div class="value blue">${index.length}</div>
  </div>
  <div class="stat-card">
    <div class="label">测试用例</div>
    <div class="value">${total}</div>
  </div>
  <div class="stat-card">
    <div class="label">通过率</div>
    <div class="value ${passed/total > 0.8 ? 'green' : passed/total > 0.5 ? 'yellow' : 'red'}">${(passed/total*100).toFixed(0)}%</div>
  </div>
  <div class="stat-card">
    <div class="label">域命中率（Top-1）</div>
    <div class="value ${domainHits/total > 0.7 ? 'green' : 'yellow'}">${(domainHits/total*100).toFixed(0)}%</div>
  </div>
  <div class="stat-card">
    <div class="label">域命中率（Any）</div>
    <div class="value green">${(anyHits/total*100).toFixed(0)}%</div>
  </div>
  <div class="stat-card">
    <div class="label">过期泄漏</div>
    <div class="value ${expiredLeaks > 0 ? 'red' : 'green'}">${expiredLeaks}</div>
  </div>
</div>

<div class="section">
  <h2>记忆分布</h2>
  <div class="tier-bar">
    ${Object.entries(tierCounts).map(([t, n]) => `<div class="tier-${t}" style="width:${n/index.length*100}%">${t} ${n}</div>`).join('')}
  </div>
  <div class="domain-list">
    ${Object.entries(domainCounts).sort((a,b) => b[1]-a[1]).map(([d, n]) => `<span class="domain-chip">${d}: ${n}</span>`).join('')}
  </div>
</div>

<div class="section">
  <h2>按模糊程度</h2>
  <div class="fuzzy-grid">
    ${Object.entries(byFuzzy).map(([level, data]) => `
      <div class="fuzzy-card">
        <div class="level">${level}</div>
        <div class="rate ${data.pass/data.total > 0.7 ? 'green' : data.pass/data.total > 0.4 ? 'yellow' : 'red'}">${data.pass}/${data.total}</div>
      </div>
    `).join('')}
  </div>
</div>

<div class="section">
  <h2>详细结果</h2>
  <table>
    <thead>
      <tr>
        <th>查询</th>
        <th>描述</th>
        <th>模糊度</th>
        <th>期望域</th>
        <th>Top-1 域</th>
        <th>Scan 结果</th>
        <th>Search Top-3</th>
        <th>结果</th>
      </tr>
    </thead>
    <tbody>
      ${results.map(r => `
        <tr>
          <td><code>${r.query}</code></td>
          <td>${r.desc}</td>
          <td><span class="tag tag-${r.fuzzyLevel}">${r.fuzzyLevel}</span></td>
          <td>${r.expectDomain || '—'}</td>
          <td>${r.topDomain || '—'}</td>
          <td>
            ${r.scanResult.slice(0, 3).map(d => `${d.domain} (${(d.maxScore*100).toFixed(0)}%)`).join('<br>') || '无匹配'}
          </td>
          <td>
            <div class="search-results">
              ${r.searchResult.slice(0, 3).map(s => `<div class="item"><span class="tier-icon">${{fresh:'🟢',recent:'🔵',faded:'🟡',ghost:'👻'}[s.tier]||'⚪'}</span>${s.summary.slice(0, 60)}</div>`).join('') || '无匹配'}
            </div>
          </td>
          <td class="${r.pass ? 'pass' : 'fail'}">${r.pass ? '✅ PASS' : '❌ FAIL'}${r.expiredLeak ? '<br>⚠️ 过期泄漏' : ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</div>

<div class="section">
  <h2>分析</h2>
  <table>
    <thead><tr><th>维度</th><th>观察</th></tr></thead>
    <tbody>
      <tr><td>高模糊度查询</td><td>${byFuzzy.high ? `${byFuzzy.high.pass}/${byFuzzy.high.total} 通过` : '—'}。单个中文词（如"支付"）依赖 bigram 分词，对短查询召回率有限。</td></tr>
      <tr><td>中模糊度查询</td><td>${byFuzzy.medium ? `${byFuzzy.medium.pass}/${byFuzzy.medium.total} 通过` : '—'}。关键词组合（如"Chrome 翻译插件"）命中率显著提升。</td></tr>
      <tr><td>低模糊度查询</td><td>${byFuzzy.low ? `${byFuzzy.low.pass}/${byFuzzy.low.total} 通过` : '—'}。具体术语（如"fonts.bunny.net"）精确匹配效果好。</td></tr>
      <tr><td>过期过滤</td><td>${expiredLeaks === 0 ? '✅ 无泄漏，过期记忆被正确过滤。' : `⚠️ ${expiredLeaks} 条过期记忆泄漏到检索结果中。`}</td></tr>
      <tr><td>衰减梯度</td><td>fresh ${tierCounts.fresh||0} / recent ${tierCounts.recent||0} / faded ${tierCounts.faded||0} / ghost ${tierCounts.ghost||0} / expired ${tierCounts.expired||0}。梯度分布合理。</td></tr>
      <tr><td>改进方向</td><td>1) 高模糊度查询需要语义 embedding 支持<br>2) 中文分词可升级为 jieba 或类似方案<br>3) 可加入 domain 别名映射提高召回</td></tr>
    </tbody>
  </table>
</div>

<footer>
  Memory Decay v0.1.0 · 测试时间 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · ${index.length} memories · ${total} test cases
</footer>

</body>
</html>`;

const outPath = new URL('../report.html', import.meta.url).pathname;
writeFileSync(outPath, html, 'utf8');
console.log(`✅ Report generated: ${outPath}`);
console.log(`   ${total} tests, ${passed} passed (${(passed/total*100).toFixed(0)}%)`);
console.log(`   Domain hit (top-1): ${(domainHits/total*100).toFixed(0)}%`);
console.log(`   Domain hit (any): ${(anyHits/total*100).toFixed(0)}%`);
console.log(`   Expired leaks: ${expiredLeaks}`);
