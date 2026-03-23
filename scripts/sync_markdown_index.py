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
ALLOWED_ROOT_FILES = {'MEMORY.md'}
ALLOWED_ROOT_DIRS = {'episodic', 'semantic', 'procedural', 'snapshots', 'legacy', 'learnings', 'archive'}
EXCLUDED_DOMAINS = {'legacy', 'archive'}
META_RE = re.compile(r'<!--\s*meta:\s*([^>]*)-->')
KV_RE = re.compile(r'(type|ttl|confidence)\s*=\s*([^,\s]+)')
SKIP_RES = [re.compile(p) for p in [
    r'^\s*$', r'^#{1,6}\s', r'^<!--', r'^>', r'^---$', r'^_', r'^\[',
    r'^```', r'^\|\s', r'^-\s-',
    r'^\*\*[^*]+\*\*\s*[:：]', r'^-\s+\*\*[^*]+\*\*\s*[:：]',
    r'^(assistant|user|A|system)\s*:', r'^Sender\s', r'^Conversation\s+info',
    r'^\{', r'^"',
]]


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def find_memory_root(start=None):
    cur = Path(start or os.getcwd()).resolve()
    for candidate in [cur] + list(cur.parents):
        if (candidate / 'memory').is_dir():
            return candidate / 'memory'
    return cur / 'memory'


def index_root(memory_root):
    root = memory_root.parent / INDEX_DIRNAME
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_index(path, entries):
    path.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + '\n', encoding='utf8')


def parse_meta(line):
    match = META_RE.search(line)
    if not match:
        return {}
    return {key: value.strip() for key, value in KV_RE.findall(match.group(1))}


def infer_created(path):
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat().replace('+00:00', 'Z')


def infer_domain(path, memory_root):
    try:
        relative = path.relative_to(memory_root)
    except ValueError:
        return 'general'
    return relative.parts[0] if len(relative.parts) >= 2 else 'general'


def is_skip(text):
    return len(text) < 8 or any(pattern.match(text) for pattern in SKIP_RES)


def extract_summary(lines, max_len=200):
    candidates = []
    for line in lines:
        text = line.strip()
        if is_skip(text):
            continue
        candidate = re.sub(r'^[-*]\s+', '', text)
        candidate = re.sub(r'^\d+\.\s+', '', candidate)
        candidate = candidate.removeprefix('**').removesuffix('**').strip()
        if len(candidate) >= 10:
            candidates.append(candidate)
    if not candidates:
        return ''
    if len(candidates[0]) >= 40:
        return candidates[0][:max_len]
    return '; '.join(candidates[:3])[:max_len]


def split_sections(lines):
    sections = []
    current = {'heading': None, 'meta': {}, 'lines': [], 'start': 0}
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('## '):
            if current['lines'] or current['heading']:
                sections.append(current)
            current = {'heading': stripped.lstrip('#').strip(), 'meta': {}, 'lines': [], 'start': index}
            continue
        metadata = parse_meta(stripped)
        if metadata:
            current['meta'].update(metadata)
            continue
        current['lines'].append(line)
    if current['lines'] or current['heading']:
        sections.append(current)
    return sections


def resolve_meta(meta):
    memory_type = meta.get('type', 'reference')
    ttl = meta.get('ttl', '30d')
    try:
        confidence = min(max(float(meta.get('confidence', '0.7')), 0.0), 1.0)
    except ValueError:
        confidence = 0.7
    if memory_type not in VALID_TYPES:
        memory_type = 'reference'
    if ttl not in VALID_TTLS:
        ttl = '30d'
    return memory_type, ttl, confidence


def age_days(created):
    created_dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
    return (datetime.now(timezone.utc) - created_dt).total_seconds() / 86400


def parse_ttl(ttl):
    if ttl == 'permanent':
        return float('inf')
    match = re.match(r'^(\d+)d$', ttl or '')
    return int(match.group(1)) if match else 30


def compute_tier(created, ttl):
    if ttl == 'permanent':
        return 'fresh'
    days = age_days(created)
    if days > parse_ttl(ttl):
        return 'expired'
    if days <= 3:
        return 'fresh'
    if days <= 14:
        return 'recent'
    if days <= 30:
        return 'faded'
    return 'ghost'


def collect_files(memory_root, include_legacy=False):
    files = []
    for path in sorted(memory_root.rglob('*.md')):
        if INDEX_DIRNAME in path.parts:
            continue
        domain = infer_domain(path, memory_root)
        if not include_legacy and domain in EXCLUDED_DOMAINS:
            continue
        files.append(path)
    return files


def entry_id(path, index):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{path.resolve()}#s{index}"))


def is_chat_dump_section(section):
    heading = (section['heading'] or '').lower()
    if 'conversation summary' in heading or 'chat log' in heading:
        return True
    content = [line.strip() for line in section['lines'] if line.strip()]
    if not content:
        return False
    chat_lines = sum(1 for line in content if re.match(r'^(assistant|user|A|system)\s*:', line))
    return len(content) > 3 and chat_lines / len(content) > 0.4


def parse_file(path, memory_root):
    lines = path.read_text(encoding='utf8').splitlines()
    sections = split_sections(lines)
    created = infer_created(path)
    domain = infer_domain(path, memory_root)
    entries = []
    for index, section in enumerate(sections):
        if is_chat_dump_section(section):
            continue
        memory_type, ttl, confidence = resolve_meta(section['meta'])
        summary = extract_summary(section['lines'])
        if not summary and section['heading']:
            summary = section['heading']
        if not summary:
            continue
        entries.append({
            'id': entry_id(path, index),
            'source': str(path.resolve()),
            'sourceType': 'markdown',
            'section': section['heading'] or f'section-{index}',
            'lineStart': section['start'],
            'created': created,
            'type': memory_type,
            'domain': domain,
            'summary': summary,
            'ttl': ttl,
            'confidence': confidence,
            'tier': compute_tier(created, ttl),
        })
    return entries


DOMAIN_PRIORITY = {
    'episodic': 0,
    'semantic': 1,
    'procedural': 2,
    'learnings': 3,
    'snapshots': 4,
    'general': 5,
    'legacy': 8,
    'archive': 9,
}


def dedup_entries(entries):
    seen = {}
    for entry in entries:
        key = entry['summary'][:120]
        if key not in seen:
            seen[key] = entry
            continue
        existing = seen[key]
        entry_priority = DOMAIN_PRIORITY.get(entry['domain'], 6)
        existing_priority = DOMAIN_PRIORITY.get(existing['domain'], 6)
        if entry_priority < existing_priority or (entry_priority == existing_priority and entry['created'] > existing['created']):
            seen[key] = entry
    return list(seen.values())


def audit_layout(memory_root):
    stray_files = []
    unknown_dirs = []
    for child in sorted(memory_root.iterdir()):
        if child.is_file() and child.suffix == '.md' and child.name not in ALLOWED_ROOT_FILES:
            stray_files.append(str(child))
        elif child.is_dir() and child.name not in ALLOWED_ROOT_DIRS:
            unknown_dirs.append(str(child))
    return stray_files, unknown_dirs


def parse_args(argv):
    allow_dirty = '--allow-dirty' in argv
    include_legacy = '--include-legacy' in argv
    args = [arg for arg in argv if arg not in {'--allow-dirty', '--include-legacy'}]
    memory_root = Path(args[0]).resolve() if args else find_memory_root()
    return memory_root, allow_dirty, include_legacy


def main():
    memory_root, allow_dirty, include_legacy = parse_args(sys.argv[1:])
    if not memory_root.exists():
        fail(f'memory root not found: {memory_root}')

    stray_files, unknown_dirs = audit_layout(memory_root)
    if (stray_files or unknown_dirs) and not allow_dirty:
        fail(
            'memory layout is dirty; run audit_memory_layout.py first or pass --allow-dirty\n'
            + ('stray root markdown files:\n  - ' + '\n  - '.join(stray_files) + '\n' if stray_files else '')
            + ('unknown root dirs:\n  - ' + '\n  - '.join(unknown_dirs) if unknown_dirs else '')
        )

    index_path = index_root(memory_root) / INDEX_FILE
    raw_entries = []
    files = collect_files(memory_root, include_legacy=include_legacy)
    for path in files:
        raw_entries.extend(parse_file(path, memory_root))
    entries = dedup_entries(raw_entries)
    save_index(index_path, entries)
    tiers = {}
    for entry in entries:
        tiers[entry['tier']] = tiers.get(entry['tier'], 0) + 1
    deduped = len(raw_entries) - len(entries)
    print(f'Indexed {len(entries)} sections from {len(files)} files into {index_path}')
    if deduped:
        print(f'Deduped: {deduped} duplicate entries removed')
    print(f'Tiers: {json.dumps(tiers)}')
    if include_legacy:
        print('Included legacy/archive domains in index')


if __name__ == '__main__':
    main()
