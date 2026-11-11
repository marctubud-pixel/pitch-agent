import json
import subprocess
import os
import tempfile
import sys
from pathlib import Path

request = json.load(sys.stdin)
scan = request.get('fcScan', '/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/fc-scan')
scratch = tempfile.TemporaryDirectory(prefix='layout-font-scan-', dir='/private/tmp')
config = Path(scratch.name) / 'fonts.conf'
config.write_text('<fontconfig><cachedir>'+scratch.name+'</cachedir></fontconfig>')
env = {**os.environ, 'FONTCONFIG_FILE': str(config), 'XDG_CACHE_HOME': scratch.name}
faces = []
for path in request['files']:
    output = subprocess.run([scan, '--format', '%{family}\x1f%{weight}\x1f%{charset}\x1f%{postscriptname}\n', path], check=True, capture_output=True, text=True, env=env, timeout=10).stdout
    for line in output.splitlines():
        family, weight, charset, postscript = line.split('\x1f')
        ranges = []
        for item in charset.split():
            bounds = item.split('-')
            ranges.append((int(bounds[0], 16), int(bounds[-1], 16)))
        missing = sorted({c for c in request['text'] if not c.isspace() and not any(a <= ord(c) <= b for a, b in ranges)})
        faces.append({'path': path, 'families': family.split(','), 'weight': float(weight), 'postscript': postscript, 'missing': missing})
regular = [f for f in faces if request['family'] in f['families'] and 40 <= f['weight'] <= 100]
bold = [f for f in faces if request['family'] in f['families'] and f['weight'] >= 180]
print(json.dumps({'faces': faces, 'passed': bool(regular and bold) and any(not f['missing'] for f in regular) and any(not f['missing'] for f in bold)}))
