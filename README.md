# memory-decay

A file-based memory workflow for AI agents.

It provides:
- structured memory writing (`type`, `ttl`, `confidence`)
- time-based decay (`fresh → recent → faded → ghost → expired`)
- keyword search with domain scanning
- layered display for old memories
- cron-friendly maintenance scripts

It does **not** require embeddings, external APIs, or model keys.

## Install

```bash
git clone https://github.com/peonai/memory-decay.git
cd memory-decay
npm install
```

## Initialize

### Option A: start with demo memories

```bash
npm run seed
npm run decay
npm run stats
```

### Option B: import your own markdown files

```bash
node scripts/import-markdown.mjs /path/to/markdown-dir
npm run decay
```

## Daily maintenance

Run decay once a day:

```bash
npm run decay
```

Install a daily cron job automatically:

```bash
npm run install-cron
```

This installs:

```bash
0 2 * * * cd /path/to/memory-decay && /path/to/memory-decay/scripts/daily-decay.sh >> /path/to/memory-decay/memory-decay.log 2>&1
```

## CLI

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

### Search

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
```

## Memory tiers

| Age | Tier | Behavior |
|-----|------|----------|
| 0-3d | fresh | full display |
| 4-14d | recent | full display |
| 15-30d | faded | summary + archived note |
| 30d+ | ghost | archived preview only |
| past ttl | expired | excluded from search |

## Suggested agent initialization prompt

Use this in your agent bootstrap or system guidance:

```text
When writing durable memory, store it through memory-decay with:
- type: decision | experiment | reference | status | temporary
- ttl: 3d | 7d | 30d | permanent
- confidence: 0.0-1.0

Prefer self-contained summaries.
Run daily decay maintenance.
Use search for direct lookup, scan for broad exploration, and focus for domain drill-down.
Do not treat expired memories as active evidence.
```

## Optional: domain aliases

Create `store/config.json` to boost search relevance for specific domains:

```json
{
  "domainAliases": {
    "payment": ["billing", "checkout", "subscription"],
    "infra": ["deploy", "server", "docker", "ci"]
  }
}
```

This is optional. Keyword search works without it.

## Directory layout

```text
memory-decay/
├── SKILL.md
├── README.md
├── bin/cli.mjs
├── lib/
├── scripts/
└── store/
```
