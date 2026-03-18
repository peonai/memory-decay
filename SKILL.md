---
name: memory-decay
description: File-based memory lifecycle workflow for AI agents. Manage durable memories with birth tagging (type/ttl/confidence), time-based decay (fresh→recent→faded→ghost→expired), keyword retrieval, layered display, and cron-friendly maintenance scripts. Use when agents need a practical memory process, periodic forgetting behavior, structured memory writing, search/scan/focus workflows, or markdown import without depending on external models or APIs.
---

# Memory Decay

Use this skill to give an agent a simple, durable memory workflow without external services.

## What this skill provides

- Structured memory writing with `type`, `ttl`, and `confidence`
- Time-based decay from `fresh` to `expired`
- Keyword retrieval with domain scanning
- Layered display for older memories
- Import and maintenance scripts
- Daily cron installation helper

## Write format

When writing a memory, include:

```text
type: decision | experiment | reference | status | temporary
ttl: 3d | 7d | 30d | permanent
confidence: 0.0-1.0
```

Prefer summaries that are self-contained and specific.

Good:
- `Chose Stripe Checkout for hosted billing`
- `SSL certificate expires March 25 and needs renewal`
- `Tried Plasmo, switched back to vanilla MV3`

Bad:
- `Continuing...`
- `I am an assistant`
- `/home/user/project`

## Decay model

| Age | Tier | Behavior |
|-----|------|----------|
| 0-3d | fresh | full display |
| 4-14d | recent | full display |
| 15-30d | faded | summary + archived note |
| 30d+ | ghost | archived preview only |
| past ttl | expired | excluded from search |

`permanent` memories do not decay.

## Commands

### Write a memory

```bash
node bin/cli.mjs write \
  --type decision \
  --domain payment \
  --summary "Chose Stripe Checkout for hosted billing" \
  --ttl permanent \
  --confidence 0.95 \
  --body "Hosted checkout reduces PCI burden and simplifies localization."
```

### Retrieve memories

```bash
node bin/cli.mjs search "billing"
node bin/cli.mjs scan "deploy"
node bin/cli.mjs focus infra
```

### Maintenance

```bash
node bin/cli.mjs decay
node bin/cli.mjs decay --dry-run
node bin/cli.mjs stats
bash scripts/install-cron.sh
```

## Import markdown

```bash
node scripts/import-markdown.mjs /path/to/markdown-dir
node bin/cli.mjs decay
```

Imported files become `reference` memories in the `general` domain by default. Re-tag manually if needed.

## Optional configuration

Create `store/config.json` to customize search behavior:

```json
{
  "domainAliases": {
    "payment": ["billing", "checkout", "subscription", "invoice"],
    "infra": ["deploy", "server", "docker", "ci", "ssl"]
  }
}
```

Domain aliases boost search relevance when a query matches an alias. This is entirely optional — keyword search works fine without it.

## Agent workflow

Write memory when any of these is true:

1. The user explicitly asks to remember something
2. A session is ending and a useful conclusion would be lost
3. A stable fact, decision, preference, or status emerged
4. A reusable workflow was discovered

Retrieve memory like this:

- direct lookup → `search`
- broad exploration → `scan`
- domain drill-down → `focus`

Run `decay` daily.

## Files

```text
memory-decay/
├── SKILL.md
├── bin/cli.mjs
├── lib/
│   ├── store.mjs
│   ├── decay.mjs
│   ├── search.mjs
│   └── compress.mjs
└── scripts/
    ├── import-markdown.mjs
    ├── daily-decay.sh
    └── install-cron.sh
```
