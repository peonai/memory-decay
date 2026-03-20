---
name: memory-decay
description: File-based memory decay workflow for AI agents that use markdown memory files. Enforce memory layout hygiene, keep root-level memory clean, build a derived index from markdown memories, apply type/ttl/confidence rules, filter expired items, and retrieve fresher memories first without replacing the original markdown store. Use when agents need practical memory decay behavior for OpenClaw-style markdown memory directories.
---

# Memory Decay

Use this skill to manage markdown memory as a structured, durable system.

Do not treat this toolkit as a replacement storage engine. Markdown remains the source of truth. The index is derived data.

## Core flow

1. Write memory in markdown
2. Put it in the correct subdirectory
3. Add inline meta tags when possible
4. Audit memory layout hygiene
5. Build or refresh the derived index from markdown
6. Query the index
7. Return the original markdown source path when citing memory

## Memory layout rules

Keep `memory/` root clean.

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

Do not create new markdown memory files directly under `memory/` root.

Recommended type-to-directory mapping:
- `decision` -> `memory/semantic/`
- `reference` -> `memory/semantic/`
- `status` -> `memory/episodic/`
- `experiment` -> `memory/episodic/`
- `temporary` -> `memory/snapshots/`

If placement is unclear, prefer appending to an existing file in the closest-fit subdirectory. If still unclear, move it to `memory/legacy/` rather than leaving it in root.

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
- leave new markdown files in `memory/` root

## Retrieval behavior

Respect metadata while retrieving:

- `experiment` past its `ttl` -> expired, do not use as a basis for action
- `confidence < 0.5` -> verify before acting
- `temporary` past its `ttl` -> ignore entirely
- `decision` with `ttl=permanent` -> trust unless explicitly superseded

## Audit layout first

Before rebuilding the index or calling setup complete, audit the memory layout:

```bash
python3 scripts/audit_memory_layout.py /path/to/openclaw/memory
```

If stray root markdown files exist, organize them first. Do not ignore structure errors.

## Indexing

Build or refresh the derived index from the markdown memory root:

```bash
# Node.js
node scripts/sync_markdown_index.mjs /path/to/openclaw/memory

# Python
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

## Setup checklist (mandatory)

First-time use of this skill MUST complete all items before reporting "done":

1. ✅ Layout audit - run `audit_memory_layout.py`, confirm root is clean or issues were organized
2. ✅ Index build - run `sync_markdown_index.py` or `sync_markdown_index.mjs`, confirm `index.json` created
3. ✅ Query test - run a search query, confirm results returned
4. ✅ Daily refresh - create a daily cron for layout audit + index refresh. Do not skip this.
5. ✅ Heartbeat check - add both layout hygiene and index freshness checks to HEARTBEAT.md

If any item is incomplete, the setup is NOT finished. Say so explicitly.

## Daily refresh (required)

Create the cron entry during initial setup. Do not wait for the user to ask.

OpenClaw example:

```bash
openclaw cron add --name "memory-decay-sync" --cron "0 2 * * *" --tz "Asia/Shanghai" --message "执行 memory-decay 巡检：先运行 python3 scripts/audit_memory_layout.py 检查 memory 根目录结构，再运行 python3 scripts/sync_markdown_index.py 刷新 .memory-decay/index.json。若发现 stray root files，先整理再报告；最后简要报告索引条目数量。" --session "isolated" --no-deliver --timeout-seconds 60
```

Unix cron example:

```bash
0 2 * * * cd /path/to/memory-decay && python3 scripts/audit_memory_layout.py /path/to/openclaw/memory && python3 scripts/sync_markdown_index.py /path/to/openclaw/memory >> /path/to/memory-decay/memory-decay.log 2>&1
```

## HEARTBEAT / health check

During heartbeats:
- Run `audit_memory_layout.py`
- If stray root markdown files exist -> organize them and report
- Read `.memory-decay/index.json` modified time
- If older than 48 hours -> run sync immediately and report
- If missing -> rebuild and alert user

Do not report memory as healthy if layout is dirty but the index is fresh.

## Decay model

| Age | Tier | Behavior |
|-----|------|----------|
| 0-3d | fresh | full display |
| 4-14d | recent | full display |
| 15-30d | faded | summary only |
| 30d+ | ghost | archived preview only |
| past ttl | expired | excluded from retrieval |
