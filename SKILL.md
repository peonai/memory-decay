---
name: memory-decay
description: File-based memory lifecycle workflow for AI agents. Manage durable memories with birth tagging (type/ttl/confidence), time-based decay (fresh->recent->faded->ghost->expired), keyword retrieval, layered display, and maintenance scripts. Use when agents need a practical memory process without embeddings, external APIs, or package dependencies. Includes both Node.js and Python standard-library scripts so the agent can choose the runtime available on the host.
---

# Memory Decay

Use this skill to give an agent a simple, durable memory workflow without external services or package installation.

## Use the scripts

Choose whichever runtime already exists on the host:

- Node.js: `node scripts/memory_decay.js ...`
- Python: `python3 scripts/memory_decay.py ...`

Both runtimes support the same commands:

- `write`
- `search`
- `scan`
- `focus`
- `decay`
- `stats`

## Write format

Every memory gets metadata at write time:

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

Confidence guide:
- Verified facts -> 0.9+
- Unverified or inferred -> 0.5-0.7
- Pure experiment -> 0.3-0.5

## Inline meta tags

When writing directly into markdown memory files instead of using the scripts, put an inline meta comment at the top of each block:

```markdown
<!-- meta: type=decision, ttl=permanent, confidence=0.95 -->
Chose PostgreSQL for production: concurrency, full-text search, mature ecosystem.

<!-- meta: type=experiment, ttl=7d, confidence=0.4 -->
Tried landing page under /tmp/test-landing/, structure wrong, likely discarded.
```

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

## Decay model

| Age | Tier | Behavior |
|-----|------|----------|
| 0-3d | fresh | full display |
| 4-14d | recent | full display |
| 15-30d | faded | summary + archived note |
| 30d+ | ghost | archived preview only |
| past ttl | expired | excluded from search |

## Commands

### Write

```bash
node scripts/memory_decay.js write --type decision --domain payment --summary "Chose Stripe Checkout" --ttl permanent --confidence 0.95
python3 scripts/memory_decay.py write --type decision --domain payment --summary "Chose Stripe Checkout" --ttl permanent --confidence 0.95
```

### Retrieve

```bash
node scripts/memory_decay.js search "billing"
node scripts/memory_decay.js scan "deploy"
node scripts/memory_decay.js focus infra
```

```bash
python3 scripts/memory_decay.py search "billing"
python3 scripts/memory_decay.py scan "deploy"
python3 scripts/memory_decay.py focus infra
```

### Maintenance

```bash
node scripts/memory_decay.js decay
python3 scripts/memory_decay.py decay
```

If the host supports cron and the user wants automation, create the cron entry explicitly during the task instead of relying on a bundled installer script.

Example cron line:

```bash
0 2 * * * cd /path/to/memory-decay && /usr/bin/env bash scripts/daily-decay.sh >> /path/to/memory-decay/memory-decay.log 2>&1
```

## Import markdown

```bash
node scripts/import-markdown.mjs /path/to/markdown-dir
```

The importer walks directories recursively and stores imported files as `reference` memories in the `general` domain by default.

## Optional configuration

Create `store/config.json` if you want domain alias boosts for search:

```json
{
  "domainAliases": {
    "payment": ["billing", "checkout", "subscription"],
    "infra": ["deploy", "server", "docker", "ci"]
  }
}
```
