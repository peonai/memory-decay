// summarize.mjs — LLM summary generation layer

const API_BASE = process.env.LLM_API_BASE || 'http://localhost:3456/v1';
const API_KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

const PROMPT = `You are a memory summarizer. Given a text, generate a one-line summary (max 80 words).

Requirements:
1. Self-contained statement, not a chat fragment
2. Include core info: what was done, why, and the outcome
3. Avoid metadata (Session Key, timestamp, paths)
4. Avoid self-introductions
5. For decisions: state the choice + reasoning
6. For experiments: state what was tried + result

Examples:
Input: Chose Stripe as payment platform. Reasons: 1. Hosted checkout 2. Multi-language 3. Reliable webhooks
Output: Stripe payment integration: chose Stripe over alternatives for hosted checkout, multi-language support, and reliable webhooks

Input: Fixed Slack notification bug: changed payload format from legacy to Block Kit
Output: Fixed Slack notification format: migrated from legacy payload to Block Kit

Now summarize:`;

export async function summarize(text, customPrompt = null) {
  const truncated = text.slice(0, 2000);
  
  const prompt = customPrompt || PROMPT;
  
  if (!API_KEY) {
    throw new Error('LLM_API_KEY not set. Export it or use firstLine fallback.');
  }

  const resp = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'user', content: prompt + '\n\n' + truncated }
      ],
      max_tokens: 150,
      temperature: 0.1,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.choices[0].message.content.trim();
}
