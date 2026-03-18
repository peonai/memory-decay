#!/usr/bin/env node
// 生成模拟历史记忆，用于真实环境测试
import { v4 as uuid } from 'uuid';
import { ensureDirs, writeMemory } from '../lib/store.mjs';

ensureDirs();

const now = Date.now();

// 模拟记忆模板
const templates = [
  // Payment domain
  { type: 'decision', domain: 'payment', summary: 'Stripe 集成方案：使用 Checkout Session + Webhook', ttl: 'permanent', confidence: 0.95, body: '选择 Stripe Checkout Session 而不是 Payment Intent，因为：1) 托管页面，减少 PCI 合规负担 2) 内置多语言支持 3) Webhook 可靠性高。相关文档：https://stripe.com/docs/payments/checkout', daysAgo: 45 },
  { type: 'experiment', domain: 'payment', summary: '试了 Paddle，定价模型不适合 SaaS', ttl: '7d', confidence: 0.4, body: 'Paddle 强制 Merchant of Record 模式，抽成 5%+2%，对小额订阅不划算。放弃。', daysAgo: 60 },
  { type: 'reference', domain: 'payment', summary: 'Stripe webhook 签名验证：使用 stripe.webhooks.constructEvent', ttl: '30d', confidence: 0.9, body: 'const event = stripe.webhooks.constructEvent(body, sig, endpointSecret); 必须用原始 body，不能 JSON.parse。', daysAgo: 30 },
  { type: 'decision', domain: 'payment', summary: '订阅计费周期：月付优先，年付 20% 折扣', ttl: 'permanent', confidence: 0.85, body: '参考竞品定价，月付 $9.99，年付 $95.88（相当于 $7.99/月）。年付转化率预期 15-20%。', daysAgo: 50 },
  
  // Blog domain
  { type: 'decision', domain: 'blog', summary: 'Hugo 主题选择：PaperMod，简洁快速', ttl: 'permanent', confidence: 0.9, body: 'PaperMod 主题优点：1) 加载速度快（无 jQuery）2) 暗色模式原生支持 3) SEO 友好 4) 中文排版优化。', daysAgo: 80 },
  { type: 'reference', domain: 'blog', summary: 'Hugo 部署流程：GitHub Actions + Cloudflare Pages', ttl: '30d', confidence: 0.95, body: 'push to main → GitHub Actions build → deploy to Cloudflare Pages。自定义域名在 Cloudflare DNS 配置 CNAME。', daysAgo: 70 },
  { type: 'status', domain: 'blog', summary: 'SEO 优化：sitemap 已提交，Google Search Console 收录 45 篇', ttl: '7d', confidence: 0.8, body: '当前收录 45/52 篇，平均排名 15-30 位。需要优化：1) 内链建设 2) 长尾关键词覆盖。', daysAgo: 5 },
  
  // Infra domain
  { type: 'decision', domain: 'infra', summary: 'CI/CD 工具：GitHub Actions，避免 Jenkins 维护成本', ttl: 'permanent', confidence: 0.9, body: 'Jenkins 需要自建服务器 + 插件维护，GitHub Actions 免费额度够用（2000 分钟/月），YAML 配置简单。', daysAgo: 90 },
  { type: 'experiment', domain: 'infra', summary: '试了 Docker Swarm，最终选择 docker-compose', ttl: '7d', confidence: 0.5, body: 'Swarm 对单机部署过于复杂，docker-compose 足够用。生产环境再考虑 K8s。', daysAgo: 100 },
  { type: 'reference', domain: 'infra', summary: 'Nginx 反向代理配置：proxy_pass + WebSocket 支持', ttl: '30d', confidence: 0.95, body: 'location / { proxy_pass http://localhost:3000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }', daysAgo: 65 },
  
  // Chrome Extension domain
  { type: 'decision', domain: 'chrome-ext', summary: 'Manifest V3 迁移：使用 Service Worker 替代 Background Page', ttl: 'permanent', confidence: 0.9, body: 'Manifest V3 强制要求，Background Page 改为 Service Worker。注意：1) 无 DOM 访问 2) 生命周期短 3) 需要 chrome.alarms 替代 setTimeout。', daysAgo: 120 },
  { type: 'reference', domain: 'chrome-ext', summary: 'Chrome Web Store 审核时间：通常 1-3 天', ttl: '30d', confidence: 0.8, body: '首次提交 3-5 天，更新 1-3 天。被拒常见原因：1) 权限过度申请 2) 隐私政策缺失 3) 截图不符合规范。', daysAgo: 40 },
  { type: 'status', domain: 'chrome-ext', summary: 'Side-by-Side Translator 用户数：1.2k，评分 4.6', ttl: '7d', confidence: 0.9, body: '周活 450，日活 120。主要反馈：1) 希望支持更多语言 2) PDF 翻译需求 3) 离线模式。', daysAgo: 3 },
];

console.log(`🌱 Generating ${templates.length} seed memories...\n`);

let count = 0;
for (const t of templates) {
  const created = new Date(now - t.daysAgo * 86400000).toISOString();
  const entry = {
    id: uuid(),
    created,
    type: t.type,
    domain: t.domain,
    summary: t.summary,
    ttl: t.ttl,
    confidence: t.confidence,
    tier: 'fresh', // decay 会自动修正
  };
  
  writeMemory(entry, t.body);
  count++;
  
  if (count % 5 === 0) {
    console.log(`  ✓ ${count}/${templates.length}`);
  }
}

console.log(`\n✅ Generated ${count} memories.`);
console.log('Run `node bin/cli.mjs decay` to apply tier assignments.');
