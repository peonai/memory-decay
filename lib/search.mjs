// search.mjs — 模糊检索引擎（TF-IDF 风格关键词匹配）
import { readIndex, readMemory, getStoreRoot } from './store.mjs';

// 简单分词：中文按字切，英文按空格/标点切
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  // 英文单词
  const eng = text.toLowerCase().match(/[a-z0-9_\-\.]+/g);
  if (eng) tokens.push(...eng);
  // 中文：bigram
  const cjk = text.match(/[\u4e00-\u9fff]+/g);
  if (cjk) {
    for (const seg of cjk) {
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
      // 也加单字，提高召回
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

function cosineSim(tfA, tfB) {
  let dot = 0, magA = 0, magB = 0;
  for (const t in tfA) {
    magA += tfA[t] ** 2;
    if (tfB[t]) dot += tfA[t] * tfB[t];
  }
  for (const t in tfB) magB += tfB[t] ** 2;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// tier 权重：越新的记忆权重越高
const TIER_WEIGHT = { fresh: 1.0, recent: 0.85, faded: 0.6, ghost: 0.3, expired: 0 };

// domain 别名映射：模拟人脑的联想
const DOMAIN_ALIASES = {
  'payment': ['支付', '付款', '收款', '订阅', 'stripe', 'creem', 'checkout', 'license', '定价', '价格', 'peonai', 'peon-ai', '商业化', '变现'],
  'infra': ['部署', '服务器', 'server', 'deploy', 'nginx', 'pm2', 'ssh', 'gateway', '路由', 'route', 'tts', '语音', 'edge-tts', 'cron', '运维', 'tailscale', 'proxy', '代理', '落地页', 'landing', 'peonai.net', '站点', 'site', 'swarm', 'wsl', '迁移', 'migrate', 'linux'],
  'blog': ['博客', '文章', 'hugo', '写作', 'post', '双语', 'newspaper', 'css', '样式', '字体', 'font', 'peon.blog'],
  'chrome-ext': ['插件', '扩展', 'extension', 'chrome', '翻译', 'translator', 'bookmarker', '浏览器', 'repurpose', 'side-by-side', 'web store', '商店', '上架', '废弃', 'deprecated', '产品'],
  'comic': ['漫画', '分镜', 'panel', 'comic', '故事'],
  'openclaw': ['agent', 'skill', 'openclaw', 'clawd', '协作', 'memory', '记忆', 'heartbeat'],
  'feishu': ['飞书', 'feishu', 'lark', '消息', 'message'],
  'douyin': ['抖音', 'douyin', '短视频'],
  'discord': ['discord', 'bot', '频道'],
  'design': ['设计', 'design', 'ui', 'ux', '界面', '落地页', 'landing page'],
  'moltbook': ['moltbook', '发布'],
};

// 计算 query 对 domain 的别名加分
function domainAliasBoost(query, domain) {
  const aliases = DOMAIN_ALIASES[domain];
  if (!aliases) return 0;
  const qLower = query.toLowerCase();
  let boost = 0;
  for (const alias of aliases) {
    if (qLower.includes(alias.toLowerCase())) boost += 0.4;
  }
  return Math.min(boost, 0.8); // cap
}

function scoreEntry(qTokens, entry, query) {
  // 基础文本匹配：summary 权重高，domain/type 也参与
  const summaryTokens = termFreq(tokenize(entry.summary || ''));
  const domainTokens = termFreq(tokenize(entry.domain || ''));
  const typeTokens = termFreq(tokenize(entry.type || ''));

  // summary 匹配
  const summaryScore = cosineSim(qTokens, summaryTokens);
  // domain 直接匹配（加权 3x）
  const domainScore = cosineSim(qTokens, domainTokens) * 3;
  // 别名加分
  const aliasBoost = domainAliasBoost(query, entry.domain);
  // tier 权重
  const tierW = TIER_WEIGHT[entry.tier] || 0.5;

  return (summaryScore + domainScore + aliasBoost) * tierW;
}

export function scan(query) {
  const root = getStoreRoot();
  const index = readIndex(root);
  const qTokens = termFreq(tokenize(query));

  // 按 domain 聚合
  const domains = {};
  for (const entry of index) {
    if (entry.tier === 'expired') continue;
    const d = entry.domain || 'uncategorized';
    if (!domains[d]) domains[d] = { domain: d, count: 0, latest: null, maxScore: 0 };
    domains[d].count++;

    const score = scoreEntry(qTokens, entry, query);

    if (score > domains[d].maxScore) domains[d].maxScore = score;
    if (!domains[d].latest || new Date(entry.created) > new Date(domains[d].latest)) {
      domains[d].latest = entry.created;
    }
  }

  return Object.values(domains)
    .filter(d => d.maxScore > 0)
    .sort((a, b) => b.maxScore - a.maxScore);
}

export function focus(domain) {
  const root = getStoreRoot();
  const index = readIndex(root);

  const entries = index
    .filter(e => e.domain === domain && e.tier !== 'expired')
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  return entries.map(e => {
    const result = { ...e };
    // fresh/recent: 返回完整 body
    if (e.tier === 'fresh' || e.tier === 'recent') {
      const full = readMemory(e.id, root);
      if (full) result.body = full.body;
    }
    // faded: 只返回 summary（已在 index 中）
    // ghost: 只返回一行索引
    return result;
  });
}

export function search(query, limit = 5) {
  const root = getStoreRoot();
  const index = readIndex(root);
  const qTokens = termFreq(tokenize(query));

  const scored = [];
  for (const entry of index) {
    if (entry.tier === 'expired') continue;
    const score = scoreEntry(qTokens, entry, query);
    if (score > 0) scored.push({ ...entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  return top.map(e => {
    const result = { ...e };
    if (e.tier === 'fresh' || e.tier === 'recent') {
      const full = readMemory(e.id, root);
      if (full) result.body = full.body;
    }
    return result;
  });
}
