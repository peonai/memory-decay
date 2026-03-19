#!/usr/bin/env python3
import json
import os
import re
import sys
import uuid
from math import sqrt
from pathlib import Path
from datetime import datetime, timezone

STORE = Path(os.getcwd()) / 'store'
VALID_TYPES = {'decision', 'experiment', 'reference', 'status', 'temporary'}
VALID_TTLS = {'3d', '7d', '30d', 'permanent'}
TIER_WEIGHT = {'fresh': 1.0, 'recent': 0.85, 'faded': 0.6, 'ghost': 0.3, 'expired': 0}


def ensure_dirs(root=STORE):
    for d in ('fresh', 'archive', 'expired'):
        (root / d).mkdir(parents=True, exist_ok=True)
    idx = root / 'index.json'
    if not idx.exists():
        idx.write_text('[]\n', encoding='utf8')
    return root


def read_index(root=STORE):
    idx = root / 'index.json'
    if not idx.exists():
        return []
    return json.loads(idx.read_text(encoding='utf8'))


def write_index(entries, root=STORE):
    (root / 'index.json').write_text(json.dumps(entries, indent=2, ensure_ascii=False) + '\n', encoding='utf8')


def storage_dir_for_tier(tier):
    if tier == 'expired':
        return 'expired'
    if tier in ('ghost', 'faded'):
        return 'archive'
    return 'fresh'


def write_memory(entry, body, root=STORE):
    ensure_dirs(root)
    path = root / storage_dir_for_tier(entry['tier']) / f"{entry['id']}.json"
    path.write_text(json.dumps({**entry, 'body': body}, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
    index = read_index(root)
    for i, item in enumerate(index):
        if item['id'] == entry['id']:
            index[i] = dict(entry)
            break
    else:
        index.append(dict(entry))
    write_index(index, root)


def read_memory(mem_id, root=STORE):
    for d in ('fresh', 'archive', 'expired'):
        path = root / d / f'{mem_id}.json'
        if path.exists():
            return json.loads(path.read_text(encoding='utf8'))
    return None


def move_memory(mem_id, old_dir, new_dir, root=STORE):
    src = root / old_dir / f'{mem_id}.json'
    dst = root / new_dir / f'{mem_id}.json'
    if src.exists() and src != dst:
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)


def count_files(d, root=STORE):
    p = root / d
    return len(list(p.glob('*.json'))) if p.exists() else 0


def parse_ttl(ttl):
    if ttl == 'permanent':
        return float('inf')
    m = re.match(r'^(\d+)d$', ttl or '')
    return int(m.group(1)) * 86400000 if m else 30 * 86400000


def age_days(created):
    dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
    return (datetime.now(timezone.utc) - dt).total_seconds() / 86400


def tier_for_age(days):
    if days <= 3:
        return 'fresh'
    if days <= 14:
        return 'recent'
    if days <= 30:
        return 'faded'
    return 'ghost'


def compute_decay(entry):
    if entry.get('ttl') == 'permanent':
        return entry.get('tier', 'fresh')
    days = age_days(entry['created'])
    ttl_days = parse_ttl(entry.get('ttl', '30d')) / 86400000
    if days > ttl_days:
        return 'expired'
    return tier_for_age(days)


def run_decay(dry_run=False):
    index = read_index(STORE)
    changes = []
    for entry in index:
        nxt = compute_decay(entry)
        if nxt != entry.get('tier'):
            changes.append({'id': entry['id'], 'summary': entry['summary'], 'domain': entry['domain'], 'from': entry.get('tier'), 'to': nxt})
            if not dry_run:
                old_dir = storage_dir_for_tier(entry.get('tier'))
                new_dir = storage_dir_for_tier(nxt)
                if old_dir != new_dir:
                    move_memory(entry['id'], old_dir, new_dir, STORE)
                entry['tier'] = nxt
    if not dry_run:
        write_index(index, STORE)
    return changes


def tokenize(text):
    if not text:
        return []
    tokens = []
    tokens.extend(re.findall(r'[a-z0-9_\-.]+', text.lower()))
    for seg in re.findall(r'[\u4e00-\u9fff]+', text):
        for i in range(len(seg) - 1):
            tokens.append(seg[i:i+2])
        tokens.extend(seg)
    return tokens


def term_freq(tokens):
    tf = {}
    for t in tokens:
        tf[t] = tf.get(t, 0) + 1
    return tf


def cosine_sim(a, b):
    dot = sum(a[t] * b.get(t, 0) for t in a)
    mag_a = sum(v * v for v in a.values())
    mag_b = sum(v * v for v in b.values())
    return 0 if not mag_a or not mag_b else dot / (sqrt(mag_a) * sqrt(mag_b))


def load_domain_aliases():
    cfg = STORE / 'config.json'
    if not cfg.exists():
        return {}
    try:
        return json.loads(cfg.read_text(encoding='utf8')).get('domainAliases', {})
    except Exception:
        return {}


def domain_alias_boost(query, domain):
    aliases = load_domain_aliases().get(domain)
    if not aliases:
        return 0
    q = query.lower()
    boost = sum(0.4 for alias in aliases if str(alias).lower() in q)
    return min(boost, 0.8)


def score_entry(q_tokens, entry, query):
    summary_score = cosine_sim(q_tokens, term_freq(tokenize(entry.get('summary', ''))))
    domain_score = cosine_sim(q_tokens, term_freq(tokenize(entry.get('domain', '')))) * 3
    alias_boost = domain_alias_boost(query, entry.get('domain'))
    tier_w = TIER_WEIGHT.get(entry.get('tier'), 0.5)
    return (summary_score + domain_score + alias_boost) * tier_w


def display_summary(summary, tier):
    return f"[archived] {summary[:15]}..." if tier == 'ghost' else summary


def search(query, limit=5):
    q = term_freq(tokenize(query))
    scored = []
    for entry in read_index(STORE):
        if entry.get('tier') == 'expired':
            continue
        score = score_entry(q, entry, query)
        if score > 0:
            item = dict(entry)
            item['score'] = score
            scored.append(item)
    scored.sort(key=lambda x: x['score'], reverse=True)
    out = []
    for e in scored[:limit]:
        if e.get('tier') in ('fresh', 'recent'):
            full = read_memory(e['id'], STORE)
            if full:
                e['body'] = full.get('body')
        out.append(e)
    return out


def scan(query):
    q = term_freq(tokenize(query))
    domains = {}
    for entry in read_index(STORE):
        if entry.get('tier') == 'expired':
            continue
        d = entry.get('domain', 'uncategorized')
        domains.setdefault(d, {'domain': d, 'count': 0, 'latest': None, 'maxScore': 0})
        domains[d]['count'] += 1
        score = score_entry(q, entry, query)
        domains[d]['maxScore'] = max(domains[d]['maxScore'], score)
        if not domains[d]['latest'] or entry['created'] > domains[d]['latest']:
            domains[d]['latest'] = entry['created']
    return sorted([d for d in domains.values() if d['maxScore'] > 0], key=lambda x: x['maxScore'], reverse=True)


def focus(domain):
    items = [e for e in read_index(STORE) if e.get('domain') == domain and e.get('tier') != 'expired']
    items.sort(key=lambda x: x['created'], reverse=True)
    out = []
    for e in items:
        item = dict(e)
        if item.get('tier') in ('fresh', 'recent'):
            full = read_memory(item['id'], STORE)
            if full:
                item['body'] = full.get('body')
        out.append(item)
    return out


def parse_args(argv):
    opts = {'_': []}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith('--'):
            key = a[2:]
            if i + 1 >= len(argv) or argv[i + 1].startswith('-'):
                opts[key] = True
            else:
                opts[key] = argv[i + 1]
                i += 1
        elif a.startswith('-'):
            key = a[1:]
            if i + 1 >= len(argv) or argv[i + 1].startswith('-'):
                opts[key] = True
            else:
                opts[key] = argv[i + 1]
                i += 1
        else:
            opts['_'].append(a)
        i += 1
    return opts


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def validate_write(opts):
    mem_type = opts.get('type') or opts.get('t')
    domain = opts.get('domain') or opts.get('d')
    summary = opts.get('summary') or opts.get('s')
    ttl = opts.get('ttl', '30d')
    body = opts.get('body') or opts.get('b') or summary
    try:
        confidence = float(opts.get('confidence') or opts.get('c') or '0.8')
    except ValueError:
        fail('Confidence must be between 0.0 and 1.0.')
    if mem_type not in VALID_TYPES:
        fail(f'Invalid type: {mem_type}')
    if not domain or not re.match(r'^[A-Za-z0-9_-]+$', domain):
        fail('Domain is required and should be a simple tag.')
    if not summary or len(summary.strip()) < 5:
        fail('Summary is required.')
    if ttl not in VALID_TTLS:
        fail(f'Invalid ttl: {ttl}')
    if not (0 <= confidence <= 1):
        fail('Confidence must be between 0.0 and 1.0.')
    return mem_type, domain, summary.strip(), ttl, confidence, body


def print_help():
    print('memory_decay.py commands:\n  write --type decision --domain infra --summary "..." [--ttl 30d] [--confidence 0.8] [--body "..."]\n  search <query> [--limit 5]\n  scan <query>\n  focus <domain>\n  decay [--dry-run]\n  stats')


def main():
    ensure_dirs(STORE)
    argv = sys.argv[1:]
    if not argv or argv[0] in ('help', '--help', '-h'):
        print_help()
        return
    cmd, rest = argv[0], argv[1:]
    if cmd == 'write':
        mem_type, domain, summary, ttl, confidence, body = validate_write(parse_args(rest))
        entry = {
            'id': str(uuid.uuid4()),
            'created': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            'type': mem_type,
            'domain': domain,
            'summary': summary,
            'ttl': ttl,
            'confidence': confidence,
            'tier': 'fresh',
        }
        write_memory(entry, body, STORE)
        print(f"Written: [{entry['type']}] {entry['summary']}")
        print(f"id: {entry['id']} | domain: {entry['domain']} | ttl: {entry['ttl']} | tier: fresh")
    elif cmd == 'search':
        args = parse_args(rest)
        query = args['_'][0] if args['_'] else None
        if not query:
            fail('Query required.')
        for e in search(query, int(args.get('limit') or args.get('n') or 5)):
            print(f"[{e['tier']}] {e['created'][:10]} | {e['domain']} | {display_summary(e['summary'], e['tier'])} | {e['score'] * 100:.0f}%")
            if e.get('body') and e.get('tier') in ('fresh', 'recent'):
                body = str(e['body'])
                print('  ' + body[:200] + ('...' if len(body) > 200 else ''))
    elif cmd == 'scan':
        args = parse_args(rest)
        query = args['_'][0] if args['_'] else None
        if not query:
            fail('Query required.')
        for d in scan(query):
            print(f"{d['domain']} ({d['count']} memories, latest: {(d['latest'] or '?')[:10]}, relevance: {d['maxScore'] * 100:.0f}%)")
    elif cmd == 'focus':
        args = parse_args(rest)
        domain = args['_'][0] if args['_'] else None
        if not domain:
            fail('Domain required.')
        for e in focus(domain):
            print(f"[{e['tier']}] {e['created'][:10]}: {e['summary']}")
            if e.get('body'):
                body = str(e['body'])
                print('  ' + body[:200] + ('...' if len(body) > 200 else ''))
    elif cmd == 'decay':
        args = parse_args(rest)
        for c in run_decay(bool(args.get('dry-run'))):
            print(f"{c['summary']} [{c['domain']}]: {c['from']} -> {c['to']}")
    elif cmd == 'stats':
        index = read_index(STORE)
        tiers, domains, types = {}, {}, {}
        for e in index:
            tiers[e['tier']] = tiers.get(e['tier'], 0) + 1
            domains[e['domain']] = domains.get(e['domain'], 0) + 1
            types[e['type']] = types.get(e['type'], 0) + 1
        print(f'Total: {len(index)}')
        print(f"Files: fresh={count_files('fresh')}, archive={count_files('archive')}, expired={count_files('expired')}")
        print('By tier:')
        for k, v in tiers.items():
            print(f'  {k}: {v}')
        print('By domain:')
        for k, v in sorted(domains.items(), key=lambda kv: kv[1], reverse=True):
            print(f'  {k}: {v}')
        print('By type:')
        for k, v in types.items():
            print(f'  {k}: {v}')
    else:
        fail(f'Unknown command: {cmd}')


if __name__ == '__main__':
    main()
