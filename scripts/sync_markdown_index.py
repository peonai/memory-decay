#!/usr/bin/env python3
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

INDEX_DIRNAME = '.memory-decay'
INDEX_FILE = 'index.json'
VALID_TYPES = {'decision', 'experiment', 'reference', 'status', 'temporary'}
VALID_TTLS = {'3d', '7d', '30d', 'permanent'}
META_RE = re.compile(r'<!--\s*meta:\s*([^>]*)-->')
KV_RE = re.compile(r'(type|ttl|confidence)\s*=\s*([^,\s]+)')
DATE_RE = re.compile(r'(\d{4}-\d{2}-\d{2})')


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def find_memory_root(start=None):
    current = Path(start or os.getcwd()).resolve()
    for candidate in [current] + list(current.parents):
        if (candidate / 'memory').is_dir():
            return candidate / 'memory'
    return current / 'memory'


def index_root(memory_root):
    root = memory_root.parent / INDEX_DIRNAME
    root.mkdir(parents=True, exist_ok=True)
    return root


def load_index(path):
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding='utf8'))


def save_index(path, entries):
    path.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + '\n', encoding='utf8')


def parse_meta(line):
    match = META_RE.search(line)
    if not match:
        return {}
    meta = {}
    for key, value in KV_RE.findall(match.group(1)):
        meta[key] = value.strip()
    return meta


def infer_created(path):
    match = DATE_RE.search(path.name)
    if match:
        return datetime.fromisoformat(match.group(1) + 'T12:00:00+00:00').isoformat().replace('+00:00', 'Z')
    stat = path.stat()
    return datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat().replace('+00:00', 'Z')


def infer_domain(path, memory_root):
    try:
        rel = path.relative_to(memory_root)
    except ValueError:
        return 'general'
    if len(rel.parts) >= 2:
        return rel.parts[0]
    return rel.stem.split('-')[0] if '-' in rel.stem else 'general'


def first_content_line(lines):
    skip_patterns = [r'^\s*$', r'^#', r'^<!--', r'^>', r'^---$', r'^_', r'^\[', r'^```', r'^\| ', r'^- -$']
    for line in lines:
        trimmed = line.strip()
        if len(trimmed) < 8:
            continue
        if any(re.match(p, trimmed) for p in skip_patterns):
            continue
        clean = re.sub(r'^\d+\.\s*', '', re.sub(r'^-\s+', '', trimmed))
        clean = clean.removeprefix('**').removesuffix('**').strip()
        if len(clean) >= 10:
            return clean[:150]
    return ''


def parse_markdown_file(path, memory_root):
    text = path.read_text(encoding='utf8')
    lines = text.splitlines()
    meta = {}
    for line in lines[:12]:
        maybe = parse_meta(line)
        if maybe:
            meta = maybe
            break
    mem_type = meta.get('type', 'reference')
    ttl = meta.get('ttl', '30d')
    confidence_raw = meta.get('confidence', '0.7')
    try:
        confidence = float(confidence_raw)
    except ValueError:
        confidence = 0.7
    if mem_type not in VALID_TYPES:
        mem_type = 'reference'
    if ttl not in VALID_TTLS:
        ttl = '30d'
    confidence = min(max(confidence, 0.0), 1.0)

    return {
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, str(path.resolve()))),
        'source': str(path.resolve()),
        'sourceType': 'markdown',
        'created': infer_created(path),
        'type': mem_type,
        'domain': infer_domain(path, memory_root),
        'summary': first_content_line(lines) or path.stem,
        'ttl': ttl,
        'confidence': confidence,
    }


def age_days(created):
    dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
    return (datetime.now(timezone.utc) - dt).total_seconds() / 86400


def parse_ttl(ttl):
    if ttl == 'permanent':
        return float('inf')
    m = re.match(r'^(\d+)d$', ttl or '')
    return int(m.group(1)) if m else 30


def tier_for_age(days):
    if days <= 3:
        return 'fresh'
    if days <= 14:
        return 'recent'
    if days <= 30:
        return 'faded'
    return 'ghost'


def compute_tier(entry):
    if entry.get('ttl') == 'permanent':
        return 'fresh'
    days = age_days(entry['created'])
    ttl_days = parse_ttl(entry.get('ttl', '30d'))
    if days > ttl_days:
        return 'expired'
    return tier_for_age(days)


def collect_markdown_files(memory_root):
    files = []
    for path in memory_root.rglob('*.md'):
        if INDEX_DIRNAME in path.parts:
            continue
        files.append(path)
    return sorted(files)


def main():
    memory_root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else find_memory_root()
    if not memory_root.exists():
        fail(f'memory root not found: {memory_root}')

    idx_root = index_root(memory_root)
    idx_path = idx_root / INDEX_FILE
    entries = []
    for path in collect_markdown_files(memory_root):
        entry = parse_markdown_file(path, memory_root)
        entry['tier'] = compute_tier(entry)
        entries.append(entry)

    save_index(idx_path, entries)
    print(f'Indexed {len(entries)} markdown memories into {idx_path}')


if __name__ == '__main__':
    main()
