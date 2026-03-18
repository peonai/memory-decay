#!/usr/bin/env node
// 从 OpenClaw workspace memory 导入到 memory-decay
import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { v4 as uuid } from 'uuid';
import { ensureDirs, writeMemory } from '../lib/store.mjs';

const WORKSPACE = process.env.HOME + '/.openclaw/workspace/memory';
const root = ensureDirs();

function extractDate(filename) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function guessDomain(text, filename) {
  const combined = (text + ' ' + filename).toLowerCase();
  const fnLower = filename.toLowerCase();

  // 优先级从高到低：文件名精确匹配的域先判断
  const domainMap = [
    ['feishu', ['feishu', '飞书', 'lark']],
    ['douyin', ['douyin', '抖音']],
    ['moltbook', ['moltbook']],
    ['comic', ['comic', '漫画', 'panel', 'episode']],
    ['tts', ['tts', '语音', 'edge-tts', 'whisper']],
    ['payment', ['creem', 'stripe', 'payment', '支付', 'checkout', 'license']],
    ['chrome-ext', ['chrome', 'extension', 'translator', 'bookmarker', '插件', 'side-by-side', 'repurpose']],
    ['blog', ['blog', 'hugo', 'newspaper', '博客', 'post-lab']],
    ['design', ['design', 'ui', 'ux', '设计', 'figma', 'layout']],
    ['discord', ['discord', 'bot', '频道']],
    ['openclaw', ['openclaw', 'clawd', 'skill', 'agent', 'heartbeat', 'memory-manager']],
    ['infra', ['gateway', 'deploy', 'server', 'nginx', 'pm2', 'tailscale', 'ssh', 'cron', '部署', '运维', 'swarm']],
  ];

  // 文件名匹配优先（更精确的信号）
  for (const [domain, keywords] of domainMap) {
    if (keywords.some(k => fnLower.includes(k))) return domain;
  }
  // 内容匹配
  for (const [domain, keywords] of domainMap) {
    if (keywords.some(k => combined.includes(k))) return domain;
  }
  return 'general';
}

function guessType(dir, filename, text) {
  if (dir === 'procedural') return 'reference';
  if (dir === 'semantic') {
    if (text.includes('决定') || text.includes('选择') || text.includes('确定')) return 'decision';
    return 'reference';
  }
  // episodic
  if (text.includes('试了') || text.includes('experiment') || text.includes('测试')) return 'experiment';
  if (text.includes('决定') || text.includes('确定') || text.includes('方案')) return 'decision';
  if (text.includes('状态') || text.includes('进度') || text.includes('status')) return 'status';
  return 'reference';
}

function guessTTL(type, dir) {
  if (type === 'decision') return 'permanent';
  if (dir === 'semantic') return 'permanent';
  if (dir === 'procedural') return 'permanent';
  if (type === 'experiment') return '7d';
  if (type === 'temporary') return '3d';
  return '30d';
}

function firstLine(text) {
  const lines = text.split('\n');
  // 跳过噪音行，找第一行有信息量的内容
  const skipPatterns = [
    /^\s*$/,                          // 空行
    /^#/,                             // markdown 标题
    /^<!--/,                          // HTML 注释
    /^>/,                             // 引用
    /^---/,                           // 分隔线
    /^\*\*Session Key\*\*/,           // Session Key 垃圾
    /^- \*\*Session Key\*\*/,
    /^\*\*Session ID\*\*/,
    /^- \*\*Session ID\*\*/,
    /^Session Key:/,
    /^Session ID:/,
    /^_/,                             // 斜体行
    /^\[/,                            // 链接行
    /^```/,                           // 代码块
    /^\| /,                           // 表格行
    /^- -$/,                          // 空列表项
    /^\*\*Source\*\*:/,
    /^Source:/,
    /^新 session 启动/,
    /^路径：/,
    /^Status:\*\*/,
    /^\*\*Status\*\*/,
    /^agent:main:/,
    /^- \*\*Source\*\*/,
    /^- \*\*Status\*\*/,
    /^\*\*问题\*\*:/,
    /^- 新 session/,
    /^账号：/,
    /^\d+\.\s*设置代理/,
    /^export\s/,
    /^curl\s/,
    /^npm\s/,
    /^git\s/,
    /^assistant:/,                     // 对话记录
    /^user:/,
    /^system:/,
    /^Conversation info/,
    /^Sender \(untrusted/,
    /^```json/,
    /^\{/,
    /^"message_id"/,
    /^"sender/,
    /^A new session was started/,
    /^Current time:/,
    /^Run your Session Startup/,
    /^NO_REPLY/,
    /^HEARTBEAT/,
    /^"timestamp"/,                    // JSON timestamp 字段
    /^"label"/,                        // JSON label 字段
    /^"id"/,                           // JSON id 字段
    /^"name"/,                         // JSON name 字段
    /^"username"/,                     // JSON username 字段
    /^"tag"/,                          // JSON tag 字段
    /^\}/,                             // JSON 结束
    /^下次改配置/,                     // 泛化的经验句（太模糊）
    /^技术架构：$/,                    // 孤立标签行
    /^修复内容\*\*：$/,               // 孤立标签行
    /^"timestamp":/,                   // timestamp 行
  ];

  // 额外检查：内容必须有足够信息密度
  const isInformative = (line) => {
    // 太短没信息量
    if (line.length < 10) return false;
    // 纯数字/标点/空格
    if (/^[\d\s\-:.,;/\\|]+$/.test(line)) return false;
    // 纯 markdown 格式符
    if (/^\*+$/.test(line) || /^-+$/.test(line)) return false;
    // 时间戳行
    if (/^\d{4}-\d{2}-\d{2}[T ]?\d{2}:\d{2}/.test(line)) return false;
    if (/^"?timestamp"?\s*[:=]/.test(line)) return false;
    // 纯路径
    if (/^[\/~][\w\/\-\.]+$/.test(line)) return false;
    return true;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 8) continue;
    if (skipPatterns.some(p => p.test(trimmed))) continue;
    // 去掉 markdown 格式符号
    const clean = trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^- /, '').replace(/^\d+\.\s*/, '');
    if (!isInformative(clean)) continue;
    return clean.slice(0, 150);
  }
  return '';
}

let imported = 0;
const seenSummaries = new Set(); // 去重

// 只导入 semantic 和 procedural，跳过 episodic（session transcript 噪音太多）
for (const dir of ['semantic', 'procedural']) {
  const dirPath = join(WORKSPACE, dir);
  let files;
  try { files = readdirSync(dirPath).filter(f => f.endsWith('.md')); } catch { continue; }

  for (const file of files) {
    const text = readFileSync(join(dirPath, file), 'utf8');
    const dateStr = extractDate(file);
    const created = dateStr ? new Date(dateStr + 'T12:00:00+08:00').toISOString() : new Date().toISOString();
    const domain = guessDomain(text, file);
    const type = guessType(dir, file, text);
    const ttl = guessTTL(type, dir);
    const summary = firstLine(text) || basename(file, '.md');

    // 去重：相同 summary 只保留第一条
    const dedupeKey = summary.slice(0, 80);
    if (seenSummaries.has(dedupeKey)) continue;
    seenSummaries.add(dedupeKey);

    const entry = {
      id: uuid(),
      created,
      type,
      domain,
      summary,
      ttl,
      confidence: dir === 'semantic' ? 0.85 : dir === 'procedural' ? 0.9 : 0.7,
      tier: 'fresh',
      source: `${dir}/${file}`,
    };

    writeMemory(entry, text, root);
    imported++;
  }
}

console.log(`✅ Imported ${imported} memories from OpenClaw workspace.`);
console.log('Run `node bin/cli.mjs decay` to apply tier assignments.');
