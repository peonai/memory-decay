#!/usr/bin/env node
// 生成模拟历史记忆，用于真实环境测试
import { v4 as uuid } from 'uuid';
import { ensureDirs, writeMemory } from '../lib/store.mjs';

ensureDirs();

const now = Date.now();

// 模拟记忆模板
const templates = [
  // ── Payment (10) ──
  { type: 'decision', domain: 'payment', summary: 'Stripe 集成方案：使用 Checkout Session + Webhook', ttl: 'permanent', confidence: 0.95, body: '选择 Stripe Checkout Session 而不是 Payment Intent，因为：1) 托管页面，减少 PCI 合规负担 2) 内置多语言支持 3) Webhook 可靠性高。', daysAgo: 45 },
  { type: 'experiment', domain: 'payment', summary: '试了 Paddle，定价模型不适合 SaaS', ttl: '7d', confidence: 0.4, body: 'Paddle 强制 Merchant of Record 模式，抽成 5%+2%，对小额订阅不划算。放弃。', daysAgo: 60 },
  { type: 'reference', domain: 'payment', summary: 'Stripe webhook 签名验证：使用 stripe.webhooks.constructEvent', ttl: '30d', confidence: 0.9, body: 'const event = stripe.webhooks.constructEvent(body, sig, endpointSecret); 必须用原始 body，不能 JSON.parse。', daysAgo: 30 },
  { type: 'decision', domain: 'payment', summary: '订阅计费周期：月付优先，年付 20% 折扣', ttl: 'permanent', confidence: 0.85, body: '参考竞品定价，月付 $9.99，年付 $95.88（相当于 $7.99/月）。年付转化率预期 15-20%。', daysAgo: 50 },
  { type: 'reference', domain: 'payment', summary: 'Stripe Customer Portal 配置：允许用户自助管理订阅', ttl: '30d', confidence: 0.9, body: 'stripe.billingPortal.sessions.create({ customer, return_url })。需要在 Dashboard 开启 Customer Portal。', daysAgo: 25 },
  { type: 'status', domain: 'payment', summary: '退款率 0.8%，低于行业平均 1.5%', ttl: '7d', confidence: 0.85, body: '上月 3 笔退款，总计 $29.97。主要原因：误操作（2笔）、功能不满足（1笔）。', daysAgo: 2 },
  { type: 'decision', domain: 'payment', summary: '免费试用期 7 天，不需要信用卡', ttl: 'permanent', confidence: 0.9, body: '参考 Notion/Linear 模式，降低注册门槛。试用转付费率预期 8-12%。', daysAgo: 55 },
  { type: 'experiment', domain: 'payment', summary: '试了 LemonSqueezy，注册流程太长', ttl: '7d', confidence: 0.3, body: 'LemonSqueezy 注册需要 5 步验证，Dashboard 加载慢，API 文档不完善。放弃。', daysAgo: 70 },
  { type: 'reference', domain: 'payment', summary: 'Stripe 测试卡号：4242424242424242', ttl: 'permanent', confidence: 1.0, body: '测试卡：4242 4242 4242 4242，任意未来日期，任意 CVC。3D Secure 测试卡：4000 0025 0000 3155。', daysAgo: 40 },
  { type: 'status', domain: 'payment', summary: '本月 MRR $487，环比增长 12%', ttl: '7d', confidence: 0.9, body: '付费用户 52 人，ARPU $9.37。新增 8 人，流失 2 人。', daysAgo: 1 },

  // ── Blog (8) ──
  { type: 'decision', domain: 'blog', summary: 'Hugo 主题选择：PaperMod，简洁快速', ttl: 'permanent', confidence: 0.9, body: 'PaperMod 主题优点：1) 加载速度快（无 jQuery）2) 暗色模式原生支持 3) SEO 友好 4) 中文排版优化。', daysAgo: 80 },
  { type: 'reference', domain: 'blog', summary: 'Hugo 部署流程：GitHub Actions + Cloudflare Pages', ttl: '30d', confidence: 0.95, body: 'push to main → GitHub Actions build → deploy to Cloudflare Pages。自定义域名在 Cloudflare DNS 配置 CNAME。', daysAgo: 70 },
  { type: 'status', domain: 'blog', summary: 'SEO 优化：sitemap 已提交，Google Search Console 收录 45 篇', ttl: '7d', confidence: 0.8, body: '当前收录 45/52 篇，平均排名 15-30 位。需要优化：1) 内链建设 2) 长尾关键词覆盖。', daysAgo: 5 },
  { type: 'decision', domain: 'blog', summary: '双语方案：中文 .md + 英文 .en.md', ttl: 'permanent', confidence: 0.95, body: 'Hugo i18n 原生支持，defaultContentLanguage = zh，英文用 .en.md 后缀。', daysAgo: 75 },
  { type: 'reference', domain: 'blog', summary: 'Hugo shortcode：自定义 callout 组件', ttl: '30d', confidence: 0.85, body: '{{< callout type="warning" >}} 内容 {{< /callout >}}。支持 info/warning/danger 三种类型。', daysAgo: 35 },
  { type: 'experiment', domain: 'blog', summary: '试了 Astro 替代 Hugo，构建速度更快但生态不成熟', ttl: '7d', confidence: 0.5, body: 'Astro 构建 52 篇文章只需 1.2s（Hugo 0.8s），但中文排版插件少，RSS 支持不完善。暂不迁移。', daysAgo: 20 },
  { type: 'status', domain: 'blog', summary: '本月发布 4 篇文章，总浏览量 2.3k', ttl: '7d', confidence: 0.9, body: '热门文章：1) AI Agent 记忆系统设计（680 PV）2) Chrome 插件开发入门（520 PV）。', daysAgo: 3 },
  { type: 'reference', domain: 'blog', summary: 'Cloudflare Pages 自定义域名：CNAME 指向 xxx.pages.dev', ttl: '30d', confidence: 0.95, body: 'DNS 配置：blog.example.com CNAME xxx.pages.dev。SSL 自动签发，无需手动配置。', daysAgo: 60 },

  // ── Infra (10) ──
  { type: 'decision', domain: 'infra', summary: 'CI/CD 工具：GitHub Actions，避免 Jenkins 维护成本', ttl: 'permanent', confidence: 0.9, body: 'Jenkins 需要自建服务器 + 插件维护，GitHub Actions 免费额度够用（2000 分钟/月），YAML 配置简单。', daysAgo: 90 },
  { type: 'experiment', domain: 'infra', summary: '试了 Docker Swarm，最终选择 docker-compose', ttl: '7d', confidence: 0.5, body: 'Swarm 对单机部署过于复杂，docker-compose 足够用。生产环境再考虑 K8s。', daysAgo: 100 },
  { type: 'reference', domain: 'infra', summary: 'Nginx 反向代理配置：proxy_pass + WebSocket 支持', ttl: '30d', confidence: 0.95, body: 'location / { proxy_pass http://localhost:3000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; }', daysAgo: 65 },
  { type: 'decision', domain: 'infra', summary: '数据库选择：SQLite 开发环境，PostgreSQL 生产环境', ttl: 'permanent', confidence: 0.95, body: 'SQLite 零配置适合开发，PostgreSQL 支持并发和全文搜索。用 Drizzle ORM 统一接口。', daysAgo: 85 },
  { type: 'reference', domain: 'infra', summary: 'Let\'s Encrypt 证书自动续期：certbot renew --nginx', ttl: '30d', confidence: 0.9, body: 'crontab: 0 0 1 * * certbot renew --nginx --quiet。证书有效期 90 天，建议每月检查。', daysAgo: 50 },
  { type: 'status', domain: 'infra', summary: '服务器 CPU 使用率 35%，内存 2.1G/4G', ttl: '3d', confidence: 0.8, body: 'VPS 4C4G，运行：Nginx + Node.js x3 + PostgreSQL + Redis。高峰期 CPU 偶尔到 60%。', daysAgo: 1 },
  { type: 'decision', domain: 'infra', summary: 'Redis 用于 session 存储和缓存，不做消息队列', ttl: 'permanent', confidence: 0.85, body: '消息队列用 BullMQ（基于 Redis），但核心 Redis 实例只做 session + 缓存，避免混用。', daysAgo: 70 },
  { type: 'experiment', domain: 'infra', summary: '试了 Bun 替代 Node.js，兼容性问题太多', ttl: '7d', confidence: 0.4, body: 'Bun 启动速度快 3x，但 node:crypto 部分 API 不兼容，sharp 图片处理库无法使用。等成熟再考虑。', daysAgo: 15 },
  { type: 'reference', domain: 'infra', summary: 'PM2 常用命令：pm2 start/stop/restart/logs/monit', ttl: 'permanent', confidence: 1.0, body: 'pm2 start ecosystem.config.cjs; pm2 logs --lines 50; pm2 monit; pm2 save; pm2 startup。', daysAgo: 80 },
  { type: 'status', domain: 'infra', summary: 'SSL 证书 3 月 25 日到期，需要续期', ttl: '7d', confidence: 0.95, body: '当前证书签发日期 2025-12-25，有效期 90 天。certbot renew 已配置 cron，但上次自动续期失败。', daysAgo: 4 },

  // ── Chrome Extension (8) ──
  { type: 'decision', domain: 'chrome-ext', summary: 'Manifest V3 迁移：使用 Service Worker 替代 Background Page', ttl: 'permanent', confidence: 0.9, body: 'Manifest V3 强制要求。注意：1) 无 DOM 访问 2) 生命周期短 3) 需要 chrome.alarms 替代 setTimeout。', daysAgo: 120 },
  { type: 'reference', domain: 'chrome-ext', summary: 'Chrome Web Store 审核时间：通常 1-3 天', ttl: '30d', confidence: 0.8, body: '首次提交 3-5 天，更新 1-3 天。被拒常见原因：1) 权限过度申请 2) 隐私政策缺失。', daysAgo: 40 },
  { type: 'status', domain: 'chrome-ext', summary: 'Side-by-Side Translator 用户数：1.2k，评分 4.6', ttl: '7d', confidence: 0.9, body: '周活 450，日活 120。主要反馈：1) 希望支持更多语言 2) PDF 翻译需求。', daysAgo: 3 },
  { type: 'decision', domain: 'chrome-ext', summary: '插件国际化：使用 chrome.i18n API + _locales 目录', ttl: 'permanent', confidence: 0.9, body: '支持 en/zh/ja/ko 四种语言。默认英文，根据浏览器语言自动切换。', daysAgo: 95 },
  { type: 'experiment', domain: 'chrome-ext', summary: '试了 Plasmo 框架，最终选择原生开发', ttl: '7d', confidence: 0.5, body: 'Plasmo 封装太重，调试困难，HMR 经常失效。原生 Manifest V3 + Vite 构建更可控。', daysAgo: 110 },
  { type: 'reference', domain: 'chrome-ext', summary: 'Content Script 注入时机：document_idle 最安全', ttl: '30d', confidence: 0.9, body: '"run_at": "document_idle" 等 DOM 完全加载后注入，避免与页面脚本冲突。', daysAgo: 55 },
  { type: 'decision', domain: 'chrome-ext', summary: '插件数据同步：chrome.storage.sync，限制 100KB', ttl: 'permanent', confidence: 0.85, body: 'sync 跨设备同步，但限制 100KB。大数据用 chrome.storage.local（限制 10MB）。', daysAgo: 88 },
  { type: 'status', domain: 'chrome-ext', summary: 'Repurpose 插件审核中，已等待 5 天', ttl: '7d', confidence: 0.7, body: '首次提交，通常 3-5 天。如果超过 7 天考虑联系 Chrome Web Store 支持。', daysAgo: 6 },

  // ── Design (6) ──
  { type: 'decision', domain: 'design', summary: '设计系统：Tailwind CSS + shadcn/ui 组件库', ttl: 'permanent', confidence: 0.95, body: 'Tailwind 原子化 CSS 开发效率高，shadcn/ui 可定制性强（复制代码而非依赖包）。', daysAgo: 100 },
  { type: 'reference', domain: 'design', summary: '品牌色：主色 #2563EB（蓝），辅色 #F59E0B（琥珀）', ttl: 'permanent', confidence: 0.9, body: '主色用于 CTA 按钮和链接，辅色用于高亮和警告。暗色模式下主色调亮 10%。', daysAgo: 90 },
  { type: 'experiment', domain: 'design', summary: '试了 Framer Motion 动画，性能开销大', ttl: '7d', confidence: 0.5, body: '列表动画导致 FPS 降到 30 以下，改用 CSS transition + will-change 优化。', daysAgo: 18 },
  { type: 'status', domain: 'design', summary: '落地页 Lighthouse 评分：Performance 92，Accessibility 98', ttl: '7d', confidence: 0.9, body: '主要扣分：1) LCP 2.1s（图片未优化）2) CLS 0.05（字体加载闪烁）。', daysAgo: 2 },
  { type: 'decision', domain: 'design', summary: '响应式断点：sm 640px, md 768px, lg 1024px, xl 1280px', ttl: 'permanent', confidence: 1.0, body: '沿用 Tailwind 默认断点，移动优先设计。特殊场景用 @container 查询。', daysAgo: 95 },
  { type: 'reference', domain: 'design', summary: '图标库：Lucide Icons，MIT 协议，支持 tree-shaking', ttl: '30d', confidence: 0.9, body: 'import { Search, Menu, X } from "lucide-react"。比 Heroicons 图标数量多，风格统一。', daysAgo: 45 },

  // ── API (4) ──
  { type: 'decision', domain: 'api', summary: 'API 认证：JWT + Refresh Token 双 token 方案', ttl: 'permanent', confidence: 0.95, body: 'Access Token 15 分钟过期，Refresh Token 7 天。Refresh Token 存 httpOnly cookie，Access Token 存内存。', daysAgo: 75 },
  { type: 'reference', domain: 'api', summary: 'Rate Limiting：express-rate-limit，100 req/min per IP', ttl: '30d', confidence: 0.9, body: 'app.use(rateLimit({ windowMs: 60000, max: 100 }))。API key 用户提升到 1000 req/min。', daysAgo: 50 },
  { type: 'experiment', domain: 'api', summary: '试了 GraphQL，REST 更适合当前规模', ttl: '7d', confidence: 0.5, body: 'GraphQL 学习曲线高，N+1 问题需要 DataLoader，当前 API 端点少（<20），REST 足够。', daysAgo: 85 },
  { type: 'status', domain: 'api', summary: 'API 平均响应时间 45ms，P99 120ms', ttl: '3d', confidence: 0.9, body: '最慢端点：/api/search（P99 280ms），需要加索引优化。其余端点均在 100ms 以内。', daysAgo: 1 },

  // ── Testing (4) ──
  { type: 'decision', domain: 'testing', summary: '测试框架：Vitest + Playwright，不用 Jest', ttl: 'permanent', confidence: 0.9, body: 'Vitest 原生 ESM 支持，与 Vite 生态一致。Playwright 比 Cypress 快且支持多浏览器。', daysAgo: 80 },
  { type: 'reference', domain: 'testing', summary: 'Playwright 截图对比：toHaveScreenshot({ maxDiffPixels: 100 })', ttl: '30d', confidence: 0.85, body: '视觉回归测试，允许 100 像素差异（字体渲染差异）。首次运行自动生成基准截图。', daysAgo: 35 },
  { type: 'status', domain: 'testing', summary: '测试覆盖率 78%，目标 85%', ttl: '7d', confidence: 0.8, body: '未覆盖：1) 支付回调处理 2) 邮件发送 3) 第三方 API mock。计划本周补充。', daysAgo: 4 },
  { type: 'experiment', domain: 'testing', summary: '试了 Storybook 做组件文档，维护成本高', ttl: '7d', confidence: 0.4, body: 'Storybook 配置复杂，每次组件改动都要同步更新 stories。改用 Ladle（轻量替代）。', daysAgo: 25 },
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
