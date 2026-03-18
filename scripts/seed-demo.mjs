#!/usr/bin/env node
// Generate realistic demo memories for testing
import { v4 as uuid } from 'uuid';
import { ensureDirs, writeMemory } from '../lib/store.mjs';

ensureDirs();

const now = Date.now();

// Demo memory templates
const templates = [
  // ── Payment (10) ──
  { type: 'decision', domain: 'payment', summary: 'Stripe integration: Checkout Session + Webhook', ttl: 'permanent', confidence: 0.95, body: 'Chose Stripe Checkout Session over Payment Intent: 1) Hosted page, less PCI burden 2) Built-in multi-language 3) Reliable webhooks.', daysAgo: 45 },
  { type: 'experiment', domain: 'payment', summary: 'Tried Paddle, pricing model not suitable for SaaS', ttl: '7d', confidence: 0.4, body: 'Paddle forces Merchant of Record model, 5%+2% cut, not cost-effective for small subscriptions. Dropped.', daysAgo: 60 },
  { type: 'reference', domain: 'payment', summary: 'Stripe webhook signature: use stripe.webhooks.constructEvent', ttl: '30d', confidence: 0.9, body: 'const event = stripe.webhooks.constructEvent(body, sig, endpointSecret); Must use raw body, not JSON.parse.', daysAgo: 30 },
  { type: 'decision', domain: 'payment', summary: 'Billing cycle: monthly preferred, annual 20% discount', ttl: 'permanent', confidence: 0.85, body: 'Based on competitor pricing: monthly $9.99, annual $95.88 ($7.99/mo). Expected annual conversion 15-20%.', daysAgo: 50 },
  { type: 'reference', domain: 'payment', summary: 'Stripe Customer Portal: allow self-service subscription management', ttl: '30d', confidence: 0.9, body: 'stripe.billingPortal.sessions.create({ customer, return_url }). Must enable Customer Portal in Dashboard.', daysAgo: 25 },
  { type: 'status', domain: 'payment', summary: 'Refund rate 0.8%, below industry average 1.5%', ttl: '7d', confidence: 0.85, body: 'Last month: 3 refunds totaling $29.97. Reasons: accidental (2), feature gap (1).', daysAgo: 2 },
  { type: 'decision', domain: 'payment', summary: '7-day free trial, no credit card required', ttl: 'permanent', confidence: 0.9, body: 'Following Notion/Linear model to lower signup barrier. Expected trial-to-paid rate 8-12%.', daysAgo: 55 },
  { type: 'experiment', domain: 'payment', summary: 'Tried LemonSqueezy, registration too cumbersome', ttl: '7d', confidence: 0.3, body: 'LemonSqueezy requires 5-step verification, slow dashboard, incomplete API docs. Dropped.', daysAgo: 70 },
  { type: 'reference', domain: 'payment', summary: 'Stripe test card: 4242424242424242', ttl: 'permanent', confidence: 1.0, body: 'Test card: 4242 4242 4242 4242, any future date, any CVC. 3D Secure test: 4000 0025 0000 3155.', daysAgo: 40 },
  { type: 'status', domain: 'payment', summary: 'Current MRR $487, 12% month-over-month growth', ttl: '7d', confidence: 0.9, body: '52 paying users, ARPU $9.37. +8 new, -2 churned.', daysAgo: 1 },

  // ── Blog (8) ──
  { type: 'decision', domain: 'blog', summary: 'Hugo theme: PaperMod, clean and fast', ttl: 'permanent', confidence: 0.9, body: 'PaperMod pros: 1) Fast loading (no jQuery) 2) Native dark mode 3) SEO friendly 4) Good CJK typography.', daysAgo: 80 },
  { type: 'reference', domain: 'blog', summary: 'Hugo deploy: GitHub Actions + Cloudflare Pages', ttl: '30d', confidence: 0.95, body: 'Push to main → GitHub Actions build → deploy to Cloudflare Pages. Custom domain via Cloudflare DNS CNAME.', daysAgo: 70 },
  { type: 'status', domain: 'blog', summary: 'SEO: sitemap submitted, Google Search Console indexed 45 posts', ttl: '7d', confidence: 0.8, body: 'Currently 45/52 indexed, avg rank 15-30. Needs: 1) Internal linking 2) Long-tail keyword coverage.', daysAgo: 5 },
  { type: 'decision', domain: 'blog', summary: 'Bilingual setup: default .md + English .en.md suffix', ttl: 'permanent', confidence: 0.95, body: 'Hugo native i18n support, defaultContentLanguage = zh, English uses .en.md suffix.', daysAgo: 75 },
  { type: 'reference', domain: 'blog', summary: 'Hugo shortcode: custom callout component', ttl: '30d', confidence: 0.85, body: '{{< callout type="warning" >}} content {{< /callout >}}. Supports info/warning/danger types.', daysAgo: 35 },
  { type: 'experiment', domain: 'blog', summary: 'Tried Astro over Hugo: faster builds but immature ecosystem', ttl: '7d', confidence: 0.5, body: 'Astro builds 52 posts in 1.2s (Hugo 0.8s), but CJK typography plugins scarce, RSS support incomplete. Not migrating.', daysAgo: 20 },
  { type: 'status', domain: 'blog', summary: 'Published 4 posts this month, 2.3k total views', ttl: '7d', confidence: 0.9, body: 'Top posts: 1) AI Agent Memory System Design (680 PV) 2) Chrome Extension Dev Guide (520 PV).', daysAgo: 3 },
  { type: 'reference', domain: 'blog', summary: 'Cloudflare Pages custom domain: CNAME to xxx.pages.dev', ttl: '30d', confidence: 0.95, body: 'DNS: blog.example.com CNAME xxx.pages.dev. SSL auto-provisioned, no manual config needed.', daysAgo: 60 },

  // ── Infra (10) ──
  { type: 'decision', domain: 'infra', summary: 'CI/CD: GitHub Actions, avoid Jenkins maintenance overhead', ttl: 'permanent', confidence: 0.9, body: 'Jenkins needs self-hosted server + plugin maintenance. GitHub Actions free tier sufficient (2000 min/mo), simple YAML config.', daysAgo: 90 },
  { type: 'experiment', domain: 'infra', summary: 'Tried Docker Swarm, settled on docker-compose', ttl: '7d', confidence: 0.5, body: 'Swarm overkill for single-machine deploy, docker-compose sufficient. Consider K8s for production later.', daysAgo: 100 },
  { type: 'reference', domain: 'infra', summary: 'Nginx reverse proxy: proxy_pass + WebSocket support', ttl: '30d', confidence: 0.95, body: 'location / { proxy_pass http://localhost:3000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; }', daysAgo: 65 },
  { type: 'decision', domain: 'infra', summary: 'Database: SQLite for dev, PostgreSQL for production', ttl: 'permanent', confidence: 0.95, body: 'SQLite zero-config for dev, PostgreSQL for concurrency and full-text search. Drizzle ORM for unified interface.', daysAgo: 85 },
  { type: 'reference', domain: 'infra', summary: 'Let\'s Encrypt auto-renewal: certbot renew --nginx', ttl: '30d', confidence: 0.9, body: 'Crontab: 0 0 1 * * certbot renew --nginx --quiet. Cert valid 90 days, check monthly.', daysAgo: 50 },
  { type: 'status', domain: 'infra', summary: 'Server CPU 35%, memory 2.1G/4G', ttl: '3d', confidence: 0.8, body: 'VPS 4C4G running: Nginx + Node.js x3 + PostgreSQL + Redis. Peak CPU occasionally hits 60%.', daysAgo: 1 },
  { type: 'decision', domain: 'infra', summary: 'Redis for session storage and caching only, not message queue', ttl: 'permanent', confidence: 0.85, body: 'Message queue uses BullMQ (Redis-based), but core Redis instance only for session + cache to avoid mixing.', daysAgo: 70 },
  { type: 'experiment', domain: 'infra', summary: 'Tried Bun over Node.js, too many compatibility issues', ttl: '7d', confidence: 0.4, body: 'Bun 3x faster startup, but node:crypto partially incompatible, sharp image lib unusable. Wait for maturity.', daysAgo: 15 },
  { type: 'reference', domain: 'infra', summary: 'PM2 cheatsheet: pm2 start/stop/restart/logs/monit', ttl: 'permanent', confidence: 1.0, body: 'pm2 start ecosystem.config.cjs; pm2 logs --lines 50; pm2 monit; pm2 save; pm2 startup.', daysAgo: 80 },
  { type: 'status', domain: 'infra', summary: 'SSL cert expires March 25, needs renewal', ttl: '7d', confidence: 0.95, body: 'Current cert issued 2025-12-25, valid 90 days. certbot renew cron configured but last auto-renewal failed.', daysAgo: 4 },

  // ── Chrome Extension (8) ──
  { type: 'decision', domain: 'chrome-ext', summary: 'Manifest V3 migration: Service Worker replaces Background Page', ttl: 'permanent', confidence: 0.9, body: 'MV3 mandatory. Notes: 1) No DOM access 2) Short lifecycle 3) Use chrome.alarms instead of setTimeout.', daysAgo: 120 },
  { type: 'reference', domain: 'chrome-ext', summary: 'Chrome Web Store review: typically 1-3 days', ttl: '30d', confidence: 0.8, body: 'First submission 3-5 days, updates 1-3 days. Common rejections: 1) Excessive permissions 2) Missing privacy policy.', daysAgo: 40 },
  { type: 'status', domain: 'chrome-ext', summary: 'Translator extension: 1.2k users, 4.6 rating', ttl: '7d', confidence: 0.9, body: 'Weekly active 450, daily 120. Top feedback: 1) More languages 2) PDF translation support.', daysAgo: 3 },
  { type: 'decision', domain: 'chrome-ext', summary: 'Extension i18n: chrome.i18n API + _locales directory', ttl: 'permanent', confidence: 0.9, body: 'Supporting en/zh/ja/ko. Default English, auto-switch based on browser language.', daysAgo: 95 },
  { type: 'experiment', domain: 'chrome-ext', summary: 'Tried Plasmo framework, chose vanilla MV3 instead', ttl: '7d', confidence: 0.5, body: 'Plasmo too heavy, debugging difficult, HMR frequently broken. Vanilla MV3 + Vite build more controllable.', daysAgo: 110 },
  { type: 'reference', domain: 'chrome-ext', summary: 'Content Script injection timing: document_idle safest', ttl: '30d', confidence: 0.9, body: '"run_at": "document_idle" waits for full DOM load, avoids conflicts with page scripts.', daysAgo: 55 },
  { type: 'decision', domain: 'chrome-ext', summary: 'Extension data sync: chrome.storage.sync, 100KB limit', ttl: 'permanent', confidence: 0.85, body: 'sync for cross-device, but 100KB limit. Large data uses chrome.storage.local (10MB limit).', daysAgo: 88 },
  { type: 'status', domain: 'chrome-ext', summary: 'Browser utility extension under review, 5 days waiting', ttl: '7d', confidence: 0.7, body: 'First submission, typically 3-5 days. If over 7 days, contact Chrome Web Store support.', daysAgo: 6 },

  // ── Design (6) ──
  { type: 'decision', domain: 'design', summary: 'Design system: Tailwind CSS + shadcn/ui components', ttl: 'permanent', confidence: 0.95, body: 'Tailwind atomic CSS for dev speed, shadcn/ui highly customizable (copy code, not dependency).', daysAgo: 100 },
  { type: 'reference', domain: 'design', summary: 'Brand colors: primary #2563EB (blue), accent #F59E0B (amber)', ttl: 'permanent', confidence: 0.9, body: 'Primary for CTA buttons and links, accent for highlights and warnings. Dark mode: primary +10% brightness.', daysAgo: 90 },
  { type: 'experiment', domain: 'design', summary: 'Tried Framer Motion animations, too much performance overhead', ttl: '7d', confidence: 0.5, body: 'List animations dropped FPS to 30. Switched to CSS transition + will-change optimization.', daysAgo: 18 },
  { type: 'status', domain: 'design', summary: 'Landing page Lighthouse: Performance 92, Accessibility 98', ttl: '7d', confidence: 0.9, body: 'Deductions: 1) LCP 2.1s (unoptimized images) 2) CLS 0.05 (font loading flash).', daysAgo: 2 },
  { type: 'decision', domain: 'design', summary: 'Responsive breakpoints: sm 640, md 768, lg 1024, xl 1280', ttl: 'permanent', confidence: 1.0, body: 'Using Tailwind defaults, mobile-first design. Special cases use @container queries.', daysAgo: 95 },
  { type: 'reference', domain: 'design', summary: 'Icon library: Lucide Icons, MIT license, tree-shakeable', ttl: '30d', confidence: 0.9, body: 'import { Search, Menu, X } from "lucide-react". More icons than Heroicons, consistent style.', daysAgo: 45 },

  // ── API (4) ──
  { type: 'decision', domain: 'api', summary: 'API auth: JWT + Refresh Token dual-token scheme', ttl: 'permanent', confidence: 0.95, body: 'Access Token 15min expiry, Refresh Token 7 days. Refresh in httpOnly cookie, Access in memory.', daysAgo: 75 },
  { type: 'reference', domain: 'api', summary: 'Rate limiting: express-rate-limit, 100 req/min per IP', ttl: '30d', confidence: 0.9, body: 'app.use(rateLimit({ windowMs: 60000, max: 100 })). API key users elevated to 1000 req/min.', daysAgo: 50 },
  { type: 'experiment', domain: 'api', summary: 'Tried GraphQL, REST better suited for current scale', ttl: '7d', confidence: 0.5, body: 'GraphQL steep learning curve, N+1 needs DataLoader, current API endpoints <20, REST sufficient.', daysAgo: 85 },
  { type: 'status', domain: 'api', summary: 'API avg response 45ms, P99 120ms', ttl: '3d', confidence: 0.9, body: 'Slowest endpoint: /api/search (P99 280ms), needs index optimization. All others under 100ms.', daysAgo: 1 },

  // ── Testing (4) ──
  { type: 'decision', domain: 'testing', summary: 'Test framework: Vitest + Playwright, not Jest', ttl: 'permanent', confidence: 0.9, body: 'Vitest native ESM support, consistent with Vite ecosystem. Playwright faster than Cypress, multi-browser.', daysAgo: 80 },
  { type: 'reference', domain: 'testing', summary: 'Playwright screenshot comparison: toHaveScreenshot({ maxDiffPixels: 100 })', ttl: '30d', confidence: 0.85, body: 'Visual regression testing, 100px tolerance for font rendering differences. First run auto-generates baseline.', daysAgo: 35 },
  { type: 'status', domain: 'testing', summary: 'Test coverage 78%, target 85%', ttl: '7d', confidence: 0.8, body: 'Uncovered: 1) Payment callback handling 2) Email sending 3) Third-party API mocks. Plan to add this week.', daysAgo: 4 },
  { type: 'experiment', domain: 'testing', summary: 'Tried Storybook for component docs, maintenance cost too high', ttl: '7d', confidence: 0.4, body: 'Storybook config complex, every component change requires story update. Switched to Ladle (lightweight alternative).', daysAgo: 25 },
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
    tier: 'fresh', // decay will auto-correct
  };
  
  writeMemory(entry, t.body);
  count++;
  
  if (count % 5 === 0) {
    console.log(`  ✓ ${count}/${templates.length}`);
  }
}

console.log(`\n✅ Generated ${count} memories.`);
console.log('Run `node bin/cli.mjs decay` to apply tier assignments.');
