#!/usr/bin/env python3
"""Check the selected specification baseline; never call business services."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = 'docs/specs/registry.json'
LOCK = 'docs/specs/spec-lock.json'


def load(path):
    return json.loads((ROOT / path).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local(path):
    p = Path(path)
    if p.is_absolute() or '..' in p.parts or not p.parts:
        raise ValueError('Nonportable normative path: ' + path)
    result = ROOT / p
    if result.is_symlink() or not result.is_file() or not result.resolve().is_relative_to(ROOT):
        raise ValueError('Missing or nonlocal normative file: ' + path)
    return result


def version(value):
    if not re.fullmatch(r'\d+\.\d+\.\d+', value):
        raise ValueError('Invalid specification version: ' + value)
    return tuple(map(int, value.split('.')))


def snapshot(registry, freezing=False):
    entries = registry['entries']
    ids = [x['id'] for x in entries]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate specification IDs')
    if len({x['path'] for x in entries}) != len(entries):
        raise ValueError('Two authoritative entries point to one file')
    expected = ['brief', 'research', 'strategy', 'themes', 'visual', 'layout', 'delivery']
    if registry['workflow'] != expected:
        raise ValueError('Workflow differs from current seven-stage decision')
    frozen = {}
    for entry in entries:
        version(entry['version'])
        if entry['lifecycle'] not in ['current', 'retired']:
            raise ValueError('Unclassified lifecycle: ' + entry['id'])
        for dependency in entry['dependsOn']:
            if dependency not in ids:
                raise ValueError('Unregistered dependency: ' + dependency)
        path = local(entry['path'])
        if entry['kind'] != 'method' and ('规范版本：' + entry['version']) not in path.read_text():
            raise ValueError('Document/registry version mismatch: ' + entry['path'])
        paths = [path]
        if entry['kind'] == 'method' and path.name == 'SKILL.md':
            paths = sorted(p for p in path.parent.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
        hashes = {str(p.relative_to(ROOT)): sha(p) for p in paths}
        frozen[entry['id']] = {'version': entry['version'], 'lifecycle': entry['lifecycle'], 'files': hashes}
    by_id = {e['id']: e for e in entries}
    for stage in expected:
        if by_id['page.' + stage]['lifecycle'] != 'current':
            raise ValueError('Current stage is retired: ' + stage)
    if by_id['page.content_review']['lifecycle'] != 'retired':
        raise ValueError('Old content review must remain retired')
    if any(x.startswith('method.') for x in by_id['agent.strategy-owner']['dependsOn']):
        raise ValueError('Strategy unexpectedly requires a method/Skill')
    images = load('docs/specs/screenshot-provenance.json')
    for image in images:
        if sha(local(image['path'])) != image['sha256']:
            raise ValueError('Screenshot bytes changed: ' + image['path'])
    for method in load('docs/specs/method-provenance.json'):
        if sha(local(method['path'])) != method['sha256']:
            raise ValueError('Fixed method snapshot differs: ' + method['path'])
    # Only normative Markdown links are required in a portable checkout.
    link_paths = set(x['path'] for x in entries if x['path'].endswith('.md'))
    link_paths.add('docs/specs/README.md')
    for name in link_paths:
        path = local(name)
        text = re.sub(r'```.*?```', '', path.read_text(), flags=re.S)
        for target in re.findall(r'\]\(([^\s)]+)', text):
            target = target.strip('<>').split('#', 1)[0]
            if not target or re.match(r'^[a-z]+:', target):
                continue
            resolved = (path.parent / target).resolve()
            if freezing and resolved == ROOT / LOCK and not resolved.exists():
                continue
            if not resolved.is_relative_to(ROOT) or not resolved.is_file():
                raise ValueError('Broken local link in ' + name + ': ' + target)
    return {'schemaVersion': 1, 'baselineVersion': registry['baselineVersion'], 'registrySha256': sha(ROOT / REGISTRY),
            'entries': frozen, 'screenshots': {x['path']: x['sha256'] for x in images}}


def compare_base(current, base):
    if not re.fullmatch(r'[0-9a-fA-F]{7,40}', base):
        raise ValueError('--base must be a commit SHA')
    result = subprocess.run(['git', 'show', base + ':' + LOCK], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise ValueError('Cannot read the base specification lock; verify the base commit')
    previous = json.loads(result.stdout)
    for identifier, old in previous['entries'].items():
        new = current['entries'].get(identifier)
        if new is None:
            raise ValueError('Preserve or retire the old entry: ' + identifier)
        if new != old and version(new['version']) <= version(old['version']):
            raise ValueError('Changed specification requires a higher version: ' + identifier)
    for path in set(previous['screenshots']) | set(current['screenshots']):
        if previous['screenshots'].get(path) != current['screenshots'].get(path):
            identifier = 'page.' + Path(path).stem
            old = previous['entries'].get(identifier)
            new = current['entries'].get(identifier)
            if old and new and version(new['version']) <= version(old['version']):
                raise ValueError('Changed screenshot requires a higher page version: ' + identifier)
    if current != previous and version(current['baselineVersion']) <= version(previous['baselineVersion']):
        raise ValueError('Changed baseline requires a higher baselineVersion and CHANGELOG entry')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--freeze', action='store_true', help='Write an explicitly reviewed file lock')
    parser.add_argument('--base', help='Compare against a previously committed lock')
    args = parser.parse_args()
    registry = load(REGISTRY)
    version(registry['baselineVersion'])
    if '## ' + registry['baselineVersion'] + ' ·' not in (ROOT / 'docs/specs/CHANGELOG.md').read_text():
        raise ValueError('Missing current baseline CHANGELOG entry')
    current = snapshot(registry, freezing=args.freeze)
    if args.base:
        compare_base(current, args.base)
    if args.freeze:
        (ROOT / LOCK).write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n')
    elif not (ROOT / LOCK).is_file() or load(LOCK) != current:
        raise ValueError('Lock differs: inspect changes, update versions/CHANGELOG, then use --freeze')
    print(json.dumps({'result': 'PASS', 'specifications': len(current['entries']), 'screenshots': len(current['screenshots']),
                      'baselineVersion': current['baselineVersion'], 'baseChecked': args.base,
                      'scope': '规范字节、引用、版本、方法与截图身份；不是业务或审美通过'}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as error:
        print('FAIL: ' + str(error), file=sys.stderr)
        sys.exit(1)
