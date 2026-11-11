#!/usr/bin/env python3
"""Check this project's navigation links and generated-data Git exclusions."""
from pathlib import Path
import json
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

root = Path(__file__).resolve().parents[1]
record = root / '.scratch/foundation-node-20261103'
files = json.loads((record / 'created-files.json').read_text())
missing = []
checked = 0
for name in files:
    path = root / name
    for href in re.findall(r'\[[^\]]*\]\(([^)]+)\)', path.read_text()):
        target = href.strip('<>')
        if urlsplit(target).scheme or target.startswith('#'):
            continue
        location = unquote(target.split('#')[0])
        if not location:
            continue
        actual = Path(location) if Path(location).is_absolute() else path.parent / location
        checked += 1
        if not actual.exists():
            missing.append({'document': name, 'target': target})

git_path = Path('/Library/Developer/CommandLineTools/usr/bin/git')
git = str(git_path) if git_path.is_file() else 'git'
cases = [
    ('.data/local-complete-acceptance-20261102/case-projects.sqlite', True),
    ('.scratch/cleanup-20261103/blobs/example.gz', True),
    ('.scratch/future-generated-test/projects.sqlite-wal', True),
    ('output/future-export/proposal.pptx', True),
    ('tmp/future-extract/page.png', True),
    ('apps/proposal-workbench/node_modules/example/index.js', True),
    ('tools/workbench/project.mjs', False),
    ('tools/workbench/fixtures/intake/mixed.pdf', False),
    ('.scratch/end-to-end-local-20261102/reference-pool-v2-20261103/pool-runtime.mjs', False),
    ('.scratch/end-to-end-local-20261102/reference-pool-v2-20261103/DRIVER-INDEPENDENT-REVIEW.json', False),
    ('docs/architecture/overview.md', False),
]
patterns = []
for name, expected in cases:
    result = subprocess.run([git, 'check-ignore', '--no-index', '--quiet', '--', name], cwd=root, capture_output=True)
    if result.returncode not in (0, 1):
        raise RuntimeError(result.stderr.decode())
    ignored = result.returncode == 0
    patterns.append({'path': name, 'exists': (root / name).exists(), 'ignored': ignored, 'expected': expected})
    if ignored != expected:
        missing.append({'ignorePolicy': name, 'expected': expected, 'actual': ignored})
result = {'localLinkTargetsChecked': checked, 'missingTargets': missing, 'gitIgnoreCases': patterns, 'scope': 'Local path existence and actual Git matching. Not browser, Markdown anchor, Codex snapshot or product acceptance.'}
(record / 'NAVIGATION-VALIDATION.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
print(json.dumps({'localLinkTargetsChecked': checked, 'failures': len(missing), 'gitIgnoreCases': len(patterns)}))
if missing:
    print(json.dumps(missing, ensure_ascii=False, indent=2))
    sys.exit(1)
