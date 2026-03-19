# memory-decay

A file-based memory workflow for AI agents.

It provides:
- structured memory writing (`type`, `ttl`, `confidence`)
- time-based decay (`fresh -> recent -> faded -> ghost -> expired`)
- keyword search with domain scanning
- layered display for old memories
- maintenance scripts that work with plain Node.js or Python

It does not require embeddings, external APIs, package managers, or model keys.

## Why this shape

This repository is a skill-style toolkit, not a packaged app.

- No `package.json`
- No bundled dependencies
- No `node_modules`
- Runtime scripts use only standard libraries
- Both Node.js and Python entrypoints are provided so agents can choose what exists on the host

## Quick start

### Node.js

```bash
node scripts/memory_decay.js write \
  --type decision \
  --domain infra \
  --summary "Chose PostgreSQL for production database" \
  --ttl permanent \
  --confidence 0.95
```

### Python

```bash
python3 scripts/memory_decay.py write \
  --type decision \
  --domain infra \
  --summary "Chose PostgreSQL for production database" \
  --ttl permanent \
  --confidence 0.95
```

## Commands

Both runtimes support the same command shape.

### Write

```bash
node scripts/memory_decay.js write \
  --type decision \
  --domain payment \
  --summary "Chose Stripe Checkout for hosted billing" \
  --ttl permanent \
  --confidence 0.95 \
  --body "Hosted checkout reduces PCI burden and simplifies localization."
```

```bash
python3 scripts/memory_decay.py write \
  --type decision \
  --domain payment \
  --summary "Chose Stripe Checkout for hosted billing" \
  --ttl permanent \
  --confidence 0.95 \
  --body "Hosted checkout reduces PCI burden and simplifies localization."
```

### Search

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
node scripts/memory_decay.js decay --dry-run
node scripts/memory_decay.js stats
```

```bash
python3 scripts/memory_decay.py decay
python3 scripts/memory_decay.py decay --dry-run
python3 scripts/memory_decay.py stats
```

## Import markdown

The importer walks directories recursively and stores imported files as `reference` memories in the `general` domain by default.

```bash
node scripts/import-markdown.mjs /path/to/markdown-dir
```

After import, run decay:

```bash
node scripts/memory_decay.js decay
# or
python3 scripts/memory_decay.py decay
```

## Daily maintenance

Run decay once a day manually.

If the host supports cron and the user wants automation, let the agent create a cron entry explicitly instead of relying on a bundled installer script.

Example cron line:

```bash
0 2 * * * cd /path/to/memory-decay && /usr/bin/env bash scripts/daily-decay.sh >> /path/to/memory-decay/memory-decay.log 2>&1
```

## Memory tiers

| Age | Tier | Behavior |
|-----|------|----------|
| 0-3d | fresh | full display |
| 4-14d | recent | full display |
| 15-30d | faded | summary + archived note |
| 30d+ | ghost | archived preview only |
| past ttl | expired | excluded from search |

## Optional domain aliases

Create `store/config.json` to boost search relevance for specific domains:

```json
{
  "domainAliases": {
    "payment": ["billing", "checkout", "subscription"],
    "infra": ["deploy", "server", "docker", "ci"]
  }
}
```

This file is optional. Basic keyword search works without it.

## Layout

```text
memory-decay/
├── SKILL.md
├── README.md
└── scripts/
    ├── memory_decay.js
    ├── memory_decay.py
    ├── import-markdown.mjs
    └── daily-decay.sh
```
