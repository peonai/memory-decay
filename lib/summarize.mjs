// summarize.mjs — LLM 摘要生成层
import { readFileSync } from 'fs';
import { join } from 'path';

const API_BASE = process.env.LLM_API_BASE || 'http://localhost:3456/v1';
const API_KEY = process.env.LLM_API_KEY || 'gw-cEWPklm6Hd1gihNEOJNwwvp2tpnJlmrt';
const MODEL = process.env.LLM_MODEL || 'gemini-3.1-pro';

const PROMPT = `你是记忆摘要生成器。给定一段文本，生成一句话摘要（不超过 80 字）。

要求：
1. 自包含的陈述句，不要对话碎片
2. 包含核心信息：做了什么、为什么、结果如何
3. 避免元数据（Session Key、timestamp、路径）
4. 避免自我介绍（"我是 Peon"）
5. 如果是决策，说明选择 + 理由
6. 如果是试验，说明尝试 + 结果

示例：
输入：选择 Creem 作为支付平台。原因：1. 国内友好 2. API 简洁 3. 支持 webhook
输出：Creem 支付集成：选择 Creem 而非 Stripe，因为国内友好、API 简洁

输入：修了 OpenClaw 飞书插件 bug：opus 用 msg_type:"media" 改为 "audio"
输出：修复飞书语音消息格式：msg_type 从 media 改为 audio

现在处理：`;

export async function summarize(text) {
  // 截断过长文本
  const truncated = text.slice(0, 2000);
  
  const resp = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'user', content: PROMPT + '\n\n' + truncated }
      ],
      max_tokens: 150,
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.choices[0].message.content.trim();
}
