#!/usr/bin/env python3
import json
import math
import os
import re
import sys
from pathlib import Path

INDEX_DIRNAME = '.memory-decay'
INDEX_FILE = 'index.json'
TIER_WEIGHT = {'fresh': 1.0, 'recent': 0.85, 'faded': 0.6, 'ghost': 0.3, 'expired': 0}


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def find_memory_root(start=None):
    current = Path(start or os.getcwd()).resolve()
    for candidate in [current] + list(current.parents):
        if (candidate / 'memory').is_dir():
            return candidate / 'memory'
    return current / 'memory'


def index_path(memory_root):
    return memory_root.parent / INDEX_DIRNAME / INDEX_FILE


def load_index(path):
    if not path.exists():
        fail(f'index not found: {path}\nRun: python3 scripts/sync_markdown_index.py {path.parent.parent / "memory"}')
    return json.loads(path.read_text(encoding='utf8'))


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
    return 0 if not mag_a or not mag_b else dot / (math.sqrt(mag_a) * math.sqrt(mag_b))


def score_entry(q_tokens, entry):
    summary_score = cosine_sim(q_tokens, term_freq(tokenize(entry.get('summary', ''))))
    domain_score = cosine_sim(q_tokens, term_freq(tokenize(entry.get('domain', '')))) * 3
    tier_w = TIER_WEIGHT.get(entry.get('tier'), 0.5)
    return (summary_score + domain_score) * tier_w


def search(index, query, limit=8):
    q = term_freq(tokenize(query))
    out = []
    for entry in index:
        if entry.get('tier') == 'expired':
            continue
        score = score_entry(q, entry)
        if score > 0:
            item = dict(entry)
            item['score'] = score
            out.append(item)
    out.sort(key=lambda x: x['score'], reverse=True)
    return out[:limit]


def focus(index, domain):
    out = [e for e in index if e.get('domain') == domain and e.get('tier') != 'expired']
    out.sort(key=lambda x: x.get('created', ''), reverse=True)
    return out


def scan(index, query):
    q = term_freq(tokenize(query))
    domains = {}
    for entry in index:
        if entry.get('tier') == 'expired':
            continue
        domain = entry.get('domain', 'uncategorized')
        domains.setdefault(domain, {'domain': domain, 'count': 0, 'latest': None, 'maxScore': 0})
        domains[domain]['count'] += 1
        score = score_entry(q, entry)
        domains[domain]['maxScore'] = max(domains[domain]['maxScore'], score)
        created = entry.get('created')
        if not domains[domain]['latest'] or (created and created > domains[domain]['latest']):
            domains[domain]['latest'] = created
    return sorted([d for d in domains.values() if d['maxScore'] > 0], key=lambda x: x['maxScore'], reverse=True)


def main():
    if len(sys.argv) < 2:
        fail('Usage: python3 scripts/query_markdown_index.py search <query> | scan <query> | focus <domain>')

    command = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else None
    memory_root = find_memory_root()
    index = load_index(index_path(memory_root))

    if command == 'search':
        if not arg:
            fail('Query required.')
        for e in search(index, arg):
            print(f"[{e['tier']}] {e['domain']} | {e['summary']} | {e['source']} | {e['score'] * 100:.0f}%")
    elif command == 'scan':
        if not arg:
            fail('Query required.')
        for d in scan(index, arg):
            latest = (d['latest'] or '?')[:10]
            print(f"{d['domain']} ({d['count']} memories, latest: {latest}, relevance: {d['maxScore'] * 100:.0f}%)")
    elif command == 'focus':
        if not arg:
            fail('Domain required.')
        for e in focus(index, arg):
            print(f"[{e['tier']}] {e['created'][:10]} | {e['summary']} | {e['source']}")
    else:
        fail(f'Unknown command: {command}')


if __name__ == '__main__':
    main()
