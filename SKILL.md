---
name: memory-decay
description: File-based memory decay workflow for AI agents that use markdown memory files. Build a derived index from markdown memories, apply type/ttl/confidence rules, filter expired items, and retrieve fresher memories first without replacing the original markdown store. Use when agents need practical memory decay behavior for OpenClaw-style markdown memory directories.
---

# Memory Decay

Use this skill to apply decay and retrieval rules to a markdown memory directory.

Do not treat this toolkit as a replacement storage engine. Markdown remains the source of truth. The index is derived data.

## Core flow

1. Keep writing memory in markdown files
2. Add inline meta tags when possible
3. Build or refresh the derived index from markdown
4. Query the index
5. Return the original markdown source path when citing memory

## Inline meta tags

When memory is stored directly in markdown, put an inline meta comment at the top of the block when possible:

```markdown
<!-- meta: type=decision, ttl=permanent, confidence=0.95 -->
Chose PostgreSQL for production: concurrency, full-text search, mature ecosystem.

<!-- meta: type=experiment, ttl=7d, confidence=0.4 -->
Tried landing page under /tmp/test-landing/, structure wrong, likely discarded.
```

If metadata is missing, the indexer falls back to conservative defaults:

- `type=reference`
- `ttl=30d`
- `confidence=0.7`

## Metadata model

```text
type:       decision | experiment | reference | status | temporary
ttl:        3d | 7d | 30d | permanent
confidence: 0.0-1.0
```

Type guide:
- `decision` - architecture choices, technical direction, product decisions
- `experiment` - exploratory attempts that may be discarded soon
- `reference` - factual info such as paths, configs, and API details
- `status` - current project or task state that will be superseded
- `temporary` - short-lived context likely to expire quickly

## Writing rules

Write memory only when at least one of these is true:

1. The user explicitly asks to remember something
2. The session is ending and a key conclusion would otherwise be lost
3. A stable fact, decision, preference, or status has become durable
4. A reusable workflow or troubleshooting process was discovered

Do not:
- store one-off chat noise as durable memory
- create a new file when appending to an existing one is enough
- write both a summary and a full copy of the same content
- treat archive or snapshot directories as active memory
- write memory "just in case"

## Retrieval behavior

Respect metadata while retrieving:

- `experiment` past its `ttl` -> expired, do not use as a basis for action
- `confidence < 0.5` -> verify before acting
- `temporary` past its `ttl` -> ignore entirely
- `decision` with `ttl=permanent` -> trust unless explicitly superseded

## Indexing

Build or refresh the derived index from the markdown memory root:

```bash
python3 scripts/sync_markdown_index.py /path/to/openclaw/memory
```

This writes:

```text
.memory-decay/index.json
```

The index stores metadata, tier assignments, and source paths pointing back to the markdown files.

## Querying

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

Always prefer returning the original markdown source path instead of treating the index as the memory itself.

## Daily refresh

If the host supports cron and the user wants automation, create the cron entry explicitly during the task instead of relying on a bundled installer script.

Example cron line:

```bash
0 2 * * * cd /path/to/memory-decay && python3 scripts/sync_markdown_index.py /path/to/openclaw/memory >> /path/to/memory-decay/memory-decay.log 2>&1
```

## Decay model

| Age | Tier | Behavior |
|-----|------|----------|
| 0-3d | fresh | full display |
| 4-14d | recent | full display |
| 15-30d | faded | summary only |
| 30d+ | ghost | archived preview only |
| past ttl | expired | excluded from retrieval |
