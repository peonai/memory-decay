---
name: memory-decay
description: Human-like fuzzy memory system with gradient decay for AI agents. Manage agent memories with birth tagging (type/ttl/confidence), time-based tier demotion (fresh→recent→faded→ghost→expired), and hybrid retrieval (TF-IDF keyword + semantic embedding). Use when agents need to write structured memories, search past decisions with fuzzy queries, run periodic decay maintenance, view memory stats, or import existing memory files. Also use when asked about memory management, forgetting, recall accuracy, or memory lifecycle.
---

# Memory Decay

Simulate human-like fuzzy memory for AI agents. Memories fade over time — recent ones are vivid, old ones become hazy, expired ones disappear from search.

## Core Mechanisms

### 1. Birth Tagging

Every memory gets metadata at write time:

```
type:       decision | experiment | reference | status | temporary
ttl:        3d | 7d | 30d | permanent
confidence: 0.0-1.0
```

### 2. Time-Based Decay

| Age | Tier | Display |
|-----|------|---------|
| 0-3d | fresh 🟢 | Full content |
| 4-14d | recent 🔵 | Full content |
| 15-30d | faded 🟡 | Summary + [archived] |
| 30d+ | ghost 👻 | [archived] first 15 chars... |
| past ttl | expired | Hidden from search |

`permanent` memories never decay.

### 3. Hybrid Retrieval

- Keyword: TF-IDF + CJK bigram tokenization + domain alias boost
- Semantic: Embedding model via OpenAI-compatible API
- Fusion: keyword 40% + semantic 60%, weighted by tier

## Quick Start

```bash
cd <skill-dir>
npm install

# Seed demo data
node scripts/seed-demo.mjs
node bin/cli.mjs decay

# Search
node bin/cli.mjs search "payment platform"
node bin/cli.mjs hybrid "that billing thing we set up"

# Stats
node bin/cli.mjs stats
```

## CLI Reference

### Write a memory

```bash
node bin/cli.mjs write \
  --type decision \
  --domain payment \
  --summary "Chose Stripe over Paddle for checkout" \
  --ttl permanent \
  --confidence 0.95 \
  --body "Stripe Checkout Session: hosted page, multi-language, reliable webhooks."
```

### Search

```bash
# Keyword search
node bin/cli.mjs search "webhook"

# Semantic search (requires embedding index)
node bin/cli.mjs embed
node bin/cli.mjs semantic "how did we handle payments"

# Hybrid search (recommended)
node bin/cli.mjs hybrid "that billing thing"

# Browse by domain
node bin/cli.mjs scan "deploy"
node bin/cli.mjs focus infra
```

### Maintenance

```bash
# Preview decay changes
node bin/cli.mjs decay --dry-run

# Apply decay
node bin/cli.mjs decay

# View stats
node bin/cli.mjs stats
```

## Embedding Configuration

Semantic search requires an OpenAI-compatible embedding API. Set via environment variables:

```bash
export EMBED_API_BASE=https://api.openai.com/v1   # or any compatible endpoint
export EMBED_API_KEY=sk-xxx
export EMBED_MODEL=text-embedding-3-small          # or any model
```

Without embedding config, keyword search and hybrid search (keyword portion only) still work.

## LLM Summary Generation

When importing bulk memories, use the LLM summary layer for high-quality summaries. Configure:

```bash
export LLM_API_BASE=http://localhost:3456/v1   # OpenAI-compatible endpoint
export LLM_API_KEY=your-key
export LLM_MODEL=gpt-4o-mini                   # or any chat model
```

Import script: `node scripts/import-markdown.mjs <directory> [--llm-summary]`

## Memory Quality Guidelines

Good summaries (high information density):
- "Chose Stripe over Paddle: hosted checkout, multi-language, reliable webhooks"
- "Blog i18n: English .en.md suffix, Hugo native i18n support"
- "Fixed mobile layout: newspaper.css 760px breakpoint, title clamp 1.8rem"

Bad summaries (noise):
- "I am an AI assistant" (self-introduction, not a memory)
- "OK, continuing..." (chat fragment)
- "/home/user/projects/..." (bare path, no context)

Principle: every memory must be a self-contained statement with what + why + outcome.

## Integration with Agent Workflows

### Write triggers (write memory when any is true)

1. User explicitly asks to remember something
2. Session ending — key conclusion would be lost
3. Stable fact, preference, or decision emerged
4. Reusable workflow discovered

### Retrieval patterns

- Precise query → `search "Stripe webhook"`
- Fuzzy recall → `hybrid "that payment thing"`
- Explore domain → `scan "deploy"` then `focus infra`

### Periodic maintenance

Run `node bin/cli.mjs decay` daily (cron or agent heartbeat).

## File Structure

```
memory-decay/
├── SKILL.md              # This file
├── bin/cli.mjs           # CLI entry point
├── lib/
│   ├── store.mjs         # File system storage
│   ├── decay.mjs         # Decay engine
│   ├── search.mjs        # TF-IDF keyword search
│   ├── embed.mjs         # Semantic embedding
│   ├── hybrid.mjs        # Hybrid fusion search
│   ├── compress.mjs      # Layered display
│   └── summarize.mjs     # LLM summary generation
└── scripts/
    ├── seed-demo.mjs        # Generate demo memories
    └── import-markdown.mjs  # Import from markdown directory
```
