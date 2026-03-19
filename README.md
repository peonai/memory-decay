# memory-decay

A file-based memory indexing workflow for AI agents.

It provides:
- metadata tagging rules for markdown memories (`type`, `ttl`, `confidence`)
- time-based decay (`fresh -> recent -> faded -> ghost -> expired`)
- a local index built from markdown memory files
- keyword search with domain scanning
- layered retrieval rules for old memories

It does not replace your markdown memory. Markdown remains the source of truth.

## Core model

OpenClaw memory already lives in a markdown directory tree.

This toolkit does not create a competing memory system anymore.
Instead, it builds a derived index from markdown files so an agent can:
- filter stale memories
- rank fresher memories higher
- search by domain and keyword
- keep returning the original markdown source path

## Real workflow

### 1. Keep writing memory in markdown

Use normal OpenClaw memory files.

If possible, add inline meta tags to memory blocks:

```markdown
<!-- meta: type=decision, ttl=permanent, confidence=0.95 -->
Chose PostgreSQL for production: concurrency, full-text search, mature ecosystem.
```

### 2. Build the index

Run this once after installation, and again whenever you want to refresh the index:

```bash
# Node.js
node scripts/sync_markdown_index.mjs /path/to/openclaw/memory

# Python
python3 scripts/sync_markdown_index.py /path/to/openclaw/memory
```

This creates a derived index in:

```text
.memory-decay/index.json
```

### 3. Query the index

```bash
# Node.js
node scripts/query_markdown_index.mjs search "billing"
node scripts/query_markdown_index.mjs scan "deploy"
node scripts/query_markdown_index.mjs focus semantic

# Python
python3 scripts/query_markdown_index.py search "billing"
python3 scripts/query_markdown_index.py scan "deploy"
python3 scripts/query_markdown_index.py focus semantic
```

Results point back to the original markdown files.

## Daily maintenance

If the host supports cron and the user wants automation, let the agent create a cron entry explicitly.

Example:

```bash
# Node.js
0 2 * * * cd /path/to/memory-decay && node scripts/sync_markdown_index.mjs /path/to/openclaw/memory >> /path/to/memory-decay/memory-decay.log 2>&1

# Python
0 2 * * * cd /path/to/memory-decay && python3 scripts/sync_markdown_index.py /path/to/openclaw/memory >> /path/to/memory-decay/memory-decay.log 2>&1
```

## Why this shape

This repository is a skill-style toolkit, not a packaged app.

- No `package.json`
- No bundled dependencies
- No `node_modules`
- Uses Python standard library only for the index workflow
- Preserves markdown as the source of truth
- Keeps retrieval state in a derived cache-like index

## Memory tiers

| Age | Tier | Behavior |
|-----|------|----------|
| 0-3d | fresh | full display |
| 4-14d | recent | full display |
| 15-30d | faded | summary only |
| 30d+ | ghost | archived preview only |
| past ttl | expired | excluded from retrieval |

## Optional domain aliases

You can extend the query script later with domain alias boosting if needed, but the current model keeps the indexing layer simple and explicit.

## Layout

```text
memory-decay/
├── SKILL.md
├── README.md
└── scripts/
    ├── sync_markdown_index.py
    ├── query_markdown_index.py
    └── daily-decay.sh
```
