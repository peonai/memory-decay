# memory-decay

A file-based memory indexing and hygiene workflow for AI agents.

It provides:
- metadata tagging rules for markdown memories (`type`, `ttl`, `confidence`)
- memory layout rules for markdown directories
- a layout audit for root-level memory hygiene
- an optional one-shot fixer for stray root files
- time-based decay (`fresh -> recent -> faded -> ghost -> expired`)
- a local index built from markdown memory files
- keyword search with domain scanning
- layered retrieval rules for old memories

It does not replace your markdown memory. Markdown remains the source of truth.

## Core model

OpenClaw memory already lives in a markdown directory tree.

This toolkit does not create a competing memory system. Instead, it defines:
- where memory files should live
- how memory metadata should be tagged
- how to audit structure hygiene
- how to repair common layout drift
- how to build a derived retrieval index from markdown files

## Required memory layout

`memory/` root should stay clean.

Allowed root files:
- `MEMORY.md`

Allowed root directories:
- `memory/episodic/`
- `memory/semantic/`
- `memory/procedural/`
- `memory/snapshots/`
- `memory/legacy/`
- `memory/learnings/`
- `memory/archive/`

New markdown memory files should not be written directly under `memory/`.

Recommended type-to-directory mapping:
- `decision` -> `memory/semantic/`
- `reference` -> `memory/semantic/`
- `status` -> `memory/episodic/`
- `experiment` -> `memory/episodic/`
- `temporary` -> `memory/snapshots/`

If placement is unclear, use an existing file in the best-fit subdirectory or move the item into `memory/legacy/`. Do not spray new files into `memory/` root.

## Real workflow

### 1. Write memory in markdown, in the right directory

Use normal OpenClaw memory files, but place them in the correct subdirectory.

If possible, add inline meta tags to memory blocks:

```markdown
<!-- meta: type=decision, ttl=permanent, confidence=0.95 -->
Chose PostgreSQL for production: concurrency, full-text search, mature ecosystem.
```

### 2. Audit layout first

Before rebuilding the index, check structure hygiene:

```bash
python3 scripts/audit_memory_layout.py /path/to/openclaw/memory
```

If stray root markdown files appear, move them out of `memory/` root before calling setup complete.

Quick repair:

```bash
python3 scripts/audit_memory_layout.py --fix /path/to/openclaw/memory
```

Repair policy:
- `YYYY-MM-DD.md` -> `memory/episodic/`
- other root markdown files -> `memory/legacy/`
- collisions auto-suffix instead of overwriting

### 3. Build the index

Run this once after installation, and again whenever you want to refresh the index:

```bash
python3 scripts/sync_markdown_index.py /path/to/openclaw/memory
```

This creates a derived index in:

```text
.memory-decay/index.json
```

Default indexing behavior:
- fails fast when `memory/` root is dirty
- excludes `memory/legacy/` and `memory/archive/`
- accepts `--allow-dirty` only for debugging
- accepts `--include-legacy` only when you intentionally want archived content indexed

### 4. Query the index

```bash
python3 scripts/query_markdown_index.py search "billing"
python3 scripts/query_markdown_index.py scan "deploy"
python3 scripts/query_markdown_index.py focus semantic
```

Results point back to the original markdown files.

## Daily maintenance

If the host supports cron and the user wants automation, let the agent create a cron entry explicitly.

Example:

```bash
0 2 * * * cd /path/to/memory-decay && python3 scripts/audit_memory_layout.py --fix /path/to/openclaw/memory && python3 scripts/sync_markdown_index.py /path/to/openclaw/memory >> /path/to/memory-decay/memory-decay.log 2>&1
```

## HEARTBEAT rules

Heartbeats should not only check index freshness. They should also audit layout hygiene.

During heartbeat:
1. Run `audit_memory_layout.py --fix`
2. If stray root markdown files existed, report what was moved before claiming memory is healthy
3. Check `.memory-decay/index.json` modified time
4. If the index is missing or older than 48 hours, rebuild it

## Why this shape

This repository is a skill-style toolkit, not a packaged app.

- No `package.json`
- No bundled dependencies
- No `node_modules`
- Preserves markdown as the source of truth
- Adds structure rules, layout audit, and derived retrieval index
- Keeps retrieval state in a derived cache-like index

## Memory tiers

| Age | Tier | Behavior |
|-----|------|----------|
| 0-3d | fresh | full display |
| 4-14d | recent | full display |
| 15-30d | faded | summary only |
| 30d+ | ghost | archived preview only |
| past ttl | expired | excluded from retrieval |

## Layout

```text
memory-decay/
├── SKILL.md
├── README.md
└── scripts/
    ├── audit_memory_layout.py
    ├── sync_markdown_index.py
    ├── query_markdown_index.py
```
