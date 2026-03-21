#!/usr/bin/env python3
"""
sync_markdown_index.py — Build a derived index from markdown memory files.

Splits files into sections by ## headings, each section gets its own index
entry with independent metadata from inline <!-- meta --> tags.
"""
import json, os, re, sys, uuid
from datetime import datetime, timezone
from pathlib import Path

INDEX_DIRNAME = '.memory-decay'
INDEX_FILE = 'index.json'
VALID_TYPES = {'decision', 'experiment', 'reference', 'status', 'temporary'}
VALID_TTLS = {'3d', '7d', '30d', 'permanent'}
META_RE = re.compile(r'<!--\s*meta:\s*([^>]*)-->')
KV_RE = re.compile(r'(type|ttl|confidence)\s*=\s*([^,\s]+)')
DATE_RE = re.compile(r'(\d{4}-\d{2}-\d{2})')
SKIP_RES = [re.compile(p) for p in [
    r'^\s*$', r'^#{1,6}\s', r'^<!--', r'^>', r'^---$', r'^_', r'^\[',
    r'^```', r'^\|\s', r'^-\s-',
    r'^\*\*[^*]+\*\*\s*[:：]', r'^-\s+\*\*[^*]+\*\*\s*[:：]',
    r'^(assistant|user|A|system)\s*:', r'^Sender\s', r'^Conversation\s+info',
    r'^\{', r'^"',
]]

def fail(msg):
    print(msg, file=sys.stderr); sys.exit(1)

def find_memory_root(start=None):
    cur = Path(start or os.getcwd()).resolve()
    for c in [cur] + list(cur.parents):
        if (c / 'memory').is_dir(): return c / 'memory'
    return cur / 'memory'

def index_root(mr):
    r = mr.parent / INDEX_DIRNAME; r.mkdir(parents=True, exist_ok=True); return r

def save_index(path, entries):
    path.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + '\n', encoding='utf8')

def parse_meta(line):
    m = META_RE.search(line)
    if not m: return {}
    return {k: v.strip() for k, v in KV_RE.findall(m.group(1))}

def infer_created(path):
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat().replace('+00:00', 'Z')

def infer_domain(path, mr):
    try: rel = path.relative_to(mr)
    except ValueError: return 'general'
    return rel.parts[0] if len(rel.parts) >= 2 else 'general'

def is_skip(t):
    return len(t) < 8 or any(p.match(t) for p in SKIP_RES)

def extract_summary(lines, max_len=200):
    cands = []
    for l in lines:
        t = l.strip()
        if is_skip(t): continue
        c = re.sub(r'^[-*]\s+', '', t)
        c = re.sub(r'^\d+\.\s+', '', c)
        c = c.removeprefix('**').removesuffix('**').strip()
        if len(c) >= 10: cands.append(c)
    if not cands: return ''
    if len(cands[0]) >= 40: return cands[0][:max_len]
    return '; '.join(cands[:3])[:max_len]

def split_sections(lines):
    secs, cur = [], {'heading': None, 'meta': {}, 'lines': [], 'start': 0}
    for i, line in enumerate(lines):
        s = line.strip()
        if s.startswith('## '):
            if cur['lines'] or cur['heading']: secs.append(cur)
            cur = {'heading': s.lstrip('#').strip(), 'meta': {}, 'lines': [], 'start': i}
            continue
        m = parse_meta(s)
        if m: cur['meta'].update(m); continue
        cur['lines'].append(line)
    if cur['lines'] or cur['heading']: secs.append(cur)
    return secs

def resolve_meta(meta):
    t = meta.get('type', 'reference')
    ttl = meta.get('ttl', '30d')
    try: conf = min(max(float(meta.get('confidence', '0.7')), 0.0), 1.0)
    except ValueError: conf = 0.7
    if t not in VALID_TYPES: t = 'reference'
    if ttl not in VALID_TTLS: ttl = '30d'
    return t, ttl, conf

def age_days(created):
    dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
    return (datetime.now(timezone.utc) - dt).total_seconds() / 86400

def parse_ttl(ttl):
    if ttl == 'permanent': return float('inf')
    m = re.match(r'^(\d+)d$', ttl or '')
    return int(m.group(1)) if m else 30

def compute_tier(created, ttl):
    if ttl == 'permanent': return 'fresh'
    d = age_days(created)
    if d > parse_ttl(ttl): return 'expired'
    if d <= 3: return 'fresh'
    if d <= 14: return 'recent'
    if d <= 30: return 'faded'
    return 'ghost'

def collect_files(mr):
    return sorted(p for p in mr.rglob('*.md') if INDEX_DIRNAME not in p.parts)

def entry_id(path, idx):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{path.resolve()}#s{idx}"))

def is_chat_dump_section(sec):
    """Detect sections that are raw chat logs, not structured memory."""
    h = (sec['heading'] or '').lower()
    if 'conversation summary' in h or 'chat log' in h:
        return True
    # If most lines start with assistant:/user:/A:/system:, it's a dump
    content = [l.strip() for l in sec['lines'] if l.strip()]
    if not content:
        return False
    chat_lines = sum(1 for l in content if re.match(r'^(assistant|user|A|system)\s*:', l))
    return len(content) > 3 and chat_lines / len(content) > 0.4

def parse_file(path, mr):
    lines = path.read_text(encoding='utf8').splitlines()
    secs = split_sections(lines)
    created = infer_created(path)
    domain = infer_domain(path, mr)
    entries = []
    for i, sec in enumerate(secs):
        if is_chat_dump_section(sec):
            continue
        t, ttl, conf = resolve_meta(sec['meta'])
        summary = extract_summary(sec['lines'])
        if not summary and sec['heading']: summary = sec['heading']
        if not summary: continue
        entries.append({
            'id': entry_id(path, i),
            'source': str(path.resolve()),
            'sourceType': 'markdown',
            'section': sec['heading'] or f"section-{i}",
            'lineStart': sec['start'],
            'created': created,
            'type': t, 'domain': domain,
            'summary': summary,
            'ttl': ttl, 'confidence': conf,
            'tier': compute_tier(created, ttl),
        })
    return entries

DOMAIN_PRIORITY = {'episodic': 0, 'semantic': 1, 'procedural': 2, 'learnings': 3,
                    'snapshots': 4, 'general': 5, 'legacy': 8, 'archive': 9}

def dedup_entries(entries):
    """Remove duplicate entries with same summary, keeping the one from
    the highest-priority domain (lowest number). Among same domain, keep newer."""
    seen = {}
    for e in entries:
        key = e['summary'][:120]
        if key not in seen:
            seen[key] = e
            continue
        existing = seen[key]
        e_pri = DOMAIN_PRIORITY.get(e['domain'], 6)
        ex_pri = DOMAIN_PRIORITY.get(existing['domain'], 6)
        if e_pri < ex_pri or (e_pri == ex_pri and e['created'] > existing['created']):
            seen[key] = e
    return list(seen.values())

def main():
    mr = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else find_memory_root()
    if not mr.exists(): fail(f'memory root not found: {mr}')
    idx_path = index_root(mr) / INDEX_FILE
    raw = []
    for p in collect_files(mr):
        raw.extend(parse_file(p, mr))
    entries = dedup_entries(raw)
    save_index(idx_path, entries)
    tiers = {}
    for e in entries: tiers[e['tier']] = tiers.get(e['tier'], 0) + 1
    deduped = len(raw) - len(entries)
    print(f'Indexed {len(entries)} sections from {len(collect_files(mr))} files into {idx_path}')
    if deduped: print(f'Deduped: {deduped} duplicate entries removed')
    print(f'Tiers: {json.dumps(tiers)}')

if __name__ == '__main__':
    main()
