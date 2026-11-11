#!/usr/bin/env python3
"""Check the explicit repository boundary and imported original identities."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local(name):
    path = Path(name)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError('Nonportable repository path: ' + name)
    result = ROOT / path
    if result.is_symlink() or not result.is_file() or not result.resolve().is_relative_to(ROOT):
        raise ValueError('Missing or linked repository file: ' + name)
    return result


def main():
    files = json.loads(local('scripts/repository-files.json').read_text())['files']
    if len(files) != len(set(files)):
        raise ValueError('Duplicate repository file')
    selected = set(files)
    for name in files:
        path = local(name)
        if any(part in {'node_modules', '__pycache__', '.data', '.audit', 'dist', 'dist-single', '.git'} for part in Path(name).parts):
            raise ValueError('Runtime or cache selected: ' + name)
        if path.name.startswith('.env') and path.name != '.env.example':
            raise ValueError('Local environment selected: ' + name)
        if path.suffix in {'.pem', '.key', '.pyc', '.sqlite', '.db', '.log'}:
            raise ValueError('Local runtime material selected: ' + name)
    normative = json.loads(local('scripts/spec-upload-files.json').read_text())['files']
    if not set(normative).issubset(selected):
        raise ValueError('Normative checkout is not included in repository selection')

    imported = json.loads(local('docs/development/source-import.json').read_text())
    adaptations = imported['adaptations']
    imported_paths = {item['path'] for item in imported['files']}
    if not set(adaptations).issubset(imported_paths):
        raise ValueError('Adaptation has no original import identity')
    for item in imported['files']:
        name = item['path']
        if name not in selected:
            raise ValueError('Imported source missing from selection: ' + name)
        change = adaptations.get(name)
        expected = change['sha256'] if change else item['sha256']
        if change and not change['reason'].strip():
            raise ValueError('Adaptation reason missing: ' + name)
        if digest(local(name)) != expected:
            raise ValueError('Imported source changed without an identity record: ' + name)

    app = 'apps/workbench-preview/'
    proofs = json.loads(local(app + 'test-fixtures/provenance/manifest.json').read_text())
    if len({p['originalPath'] for p in proofs}) != len(proofs):
        raise ValueError('Ambiguous original proof identity')
    for proof in proofs:
        name = app + proof['file']
        if name not in selected or digest(local(name)) != proof['sha256']:
            raise ValueError('Original proof missing or changed: ' + proof['originalPath'])

    # Current engineering entrypoints must work in a selected checkout.
    docs = ['README.md', 'CONTRIBUTING.md', 'docs/architecture/runtime.md']
    docs += [name for name in files if name.startswith(('docs/development/', 'docs/usage/', 'status/issues/')) and name.endswith('.md')]
    for name in docs:
        path = local(name)
        text = re.sub(r'```.*?```', '', path.read_text(), flags=re.S)
        for target in re.findall(r'\]\(([^\s)]+)', text):
            target = target.strip('<>').split('#', 1)[0]
            if not target or re.match(r'^[a-z]+:', target):
                continue
            resolved = (path.parent / target).resolve()
            if not resolved.is_relative_to(ROOT) or str(resolved.relative_to(ROOT)) not in selected:
                raise ValueError('Nonportable engineering link: ' + name + ': ' + target)
            local(str(resolved.relative_to(ROOT)))
    print(json.dumps({'result': 'PASS', 'repositoryFiles': len(files), 'importedFiles': len(imported['files']),
                      'preservedProofs': len(proofs), 'scope': '明示源码、文档和原件身份；不代表正式业务或原生运行时通过'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
