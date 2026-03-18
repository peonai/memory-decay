---
name: memory-decay
description: File-based memory lifecycle workflow for AI agents. Manage durable memories with birth tagging (type/ttl/confidence), time-based decay (fresh→recent→faded→ghost→expired), keyword retrieval, layered display, and cron-friendly maintenance scripts. Includes write policy, retrieval behavior rules, and anti-patterns from production use. Use when agents need a practical memory process without depending on external models or APIs.
---

# Memory Decay

Use this skill to give an agent a simple, durable memory workflow without external services.

## What this skill provides

- Structured memory writing with `type`, `ttl`, and `confidence`
- Time-based decay from `fresh` to `expired`
- Keyword retrieval with domain scanning
- Layered display for older memories
- Write policy with trigger rules and anti-patterns
- Retrieval behavior rules based on metadata
- Import and maintenance scripts
- Daily cron installation helper

## Write format

Every memory gets metadata at write time:

```text
type:       decision | experiment | reference | status | temporary
ttl:        3d | 7d | 30d | permanent
confidence: 0.0-1.0
```

Type guide:
- `decision` — architecture choices, technical direction, product decisions (long-lived)
- `experiment` — exploratory attempts, may be discarded soon
- `reference` — factual info: paths, configs, API details
- `status` — current state of a project or task, will be superseded
- `temporary` — short-lived context, likely useless in a few days

TTL defaults to `30d` if not specified.

Confidence guide:
- Verified facts → 0.9+
- Unverified or inferred → 0.5-0.7
- Pure experiment → 0.3-0.5

### Inline meta tag (for markdown-based memory)

When writing memory directly to markdown files (not via CLI), include an inline meta comment as the first line of each block:

```markdown
<!-- meta: type=decision, ttl=permanent, confidence=0.95 -->
Chose PostgreSQL for production: concurrency, full-text search, mature ecosystem.

<!-- meta: type=experiment, ttl=7d, confidence=0.4 -->
Tried landing page under /tmp/test-landing/, structure wrong, likely discarded.

<!-- meta: type=reference, ttl=30d, confidence=0.8 -->
API rate limit: 100 req/min per IP, configured via express-rate-limit.
```

### Summary quality

Prefer summaries that are self-contained and specific.

Good:
- `Chose Stripe Checkout for hosted billing`
- `SSL certificate expires March 25 and needs renewal`
- `Tried Plasmo, switched back to vanilla MV3`

Bad:
- `Continuing...`
- `I am an assistant`
- `/home/user/project`

Every memory should be a self-contained statement with what + why + outcome.

## Write triggers

Write memory only when at least one of these is true:

1. The user explicitly asks to remember something
2. The session is ending and a key conclusion would otherwise be lost
3. A stable fact, decision, preference, or status has become durable
4. A reusable workflow or troubleshooting process was discovered

If none of these apply, do not write memory.

## Anti-patterns

Do not:
- Store one-off chat noise as durable memory
- Create a new file when appending to an existing one is enough
- Write both a summary and a full copy of the same content
- Treat archive or snapshot directories as active memory
- Write memory "just in case" — uncertainty is not a trigger

## Retrieval behavior

When retrieving memories, respect metadata:

- `type=experiment` past its `ttl` → treat as expired, do not use as basis for action
- `confidence < 0.5` → verify before acting (check if file exists, API is reachable, etc.)
- `type=temporary` past its `ttl` → ignore entirely
- `type=decision` with `ttl=permanent` → trust unless explicitly superseded

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

Retrieval patterns:
- Precise query → `search`
- Broad exploration → `scan`
- Domain drill-down → `focus`

### Maintenance

```bash
node bin/cli.mjs decay
node bin/cli.mjs decay --dry-run
node bin/cli.mjs stats
bash scripts/install-cron.sh
```

Run `decay` daily.

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

## Files

```text
memory-decay/
├── SKILL.md
├── README.md
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
