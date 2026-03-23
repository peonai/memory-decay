#!/usr/bin/env python3
import json
import os
import shutil
import sys
from pathlib import Path

ALLOWED_ROOT_FILES = {'MEMORY.md'}
ALLOWED_ROOT_DIRS = {
    'episodic',
    'semantic',
    'procedural',
    'snapshots',
    'legacy',
    'learnings',
    'archive',
}
TYPE_TO_DIR = {
    'decision': 'semantic',
    'reference': 'semantic',
    'status': 'episodic',
    'experiment': 'episodic',
    'temporary': 'snapshots',
}


def find_memory_root(start=None):
    current = Path(start or os.getcwd()).resolve()
    for candidate in [current] + list(current.parents):
        if (candidate / 'memory').is_dir():
            return candidate / 'memory'
    return current / 'memory'


def suggest_dir_for_root_file(path):
    name = path.name
    if name == 'MEMORY.md':
        return 'root'
    if name.endswith('.md') and len(name) >= 13 and name[:10].count('-') == 2:
        if name[10:] == '.md':
            return 'episodic'
    return 'legacy'


def audit(memory_root):
    stray_files = []
    unknown_dirs = []
    suggestions = []

    for child in sorted(memory_root.iterdir()):
        if child.is_file() and child.suffix == '.md' and child.name not in ALLOWED_ROOT_FILES:
            stray_files.append(str(child))
            suggestions.append({
                'path': str(child),
                'suggestedDir': suggest_dir_for_root_file(child),
                'reason': 'root markdown files should not live directly under memory/'
            })
        elif child.is_dir() and child.name not in ALLOWED_ROOT_DIRS:
            unknown_dirs.append(str(child))

    return {
        'memoryRoot': str(memory_root),
        'allowedRootFiles': sorted(ALLOWED_ROOT_FILES),
        'allowedRootDirs': sorted(ALLOWED_ROOT_DIRS),
        'typeToDir': TYPE_TO_DIR,
        'strayRootMarkdownFiles': stray_files,
        'unknownRootDirs': unknown_dirs,
        'suggestions': suggestions,
        'ok': not stray_files and not unknown_dirs,
    }


def apply_fixes(memory_root, audit_result):
    moved = []
    for suggestion in audit_result['suggestions']:
        source = Path(suggestion['path'])
        if not source.exists():
            continue
        target_dir = memory_root / suggestion['suggestedDir']
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / source.name
        if target.exists():
            stem = source.stem
            suffix = source.suffix
            counter = 1
            while target.exists():
                target = target_dir / f"{stem}-{counter}{suffix}"
                counter += 1
        shutil.move(str(source), str(target))
        moved.append({'from': str(source), 'to': str(target)})
    return moved


def main():
    fix = '--fix' in sys.argv[1:]
    args = [arg for arg in sys.argv[1:] if arg != '--fix']
    memory_root = Path(args[0]).resolve() if args else find_memory_root()
    if not memory_root.exists():
        print(f'memory root not found: {memory_root}', file=sys.stderr)
        sys.exit(1)

    result = audit(memory_root)
    if fix and not result['ok']:
        fixes_applied = apply_fixes(memory_root, result)
        result = audit(memory_root)
        result['fixesApplied'] = fixes_applied
    print(json.dumps(result, indent=2, ensure_ascii=False))

    if result['ok']:
        print('\nLayout OK')
    else:
        print('\nLayout issues detected')
        if result['strayRootMarkdownFiles']:
            print('- stray root markdown files:')
            for path in result['strayRootMarkdownFiles']:
                print(f'  - {path}')
        if result['unknownRootDirs']:
            print('- unknown root dirs:')
            for path in result['unknownRootDirs']:
                print(f'  - {path}')


if __name__ == '__main__':
    main()
