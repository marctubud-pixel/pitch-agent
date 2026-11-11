"""Finite native-manifest transport. Raw token spans define cross-language identities."""
import hashlib
import json
import math
import os
import re
import stat
from pathlib import Path

SCHEMA = json.loads(Path(__file__).with_name('native-manifest-slots.json').read_text())
VERSION = SCHEMA['version']
LIMITS = SCHEMA['limits']

def need(ok, code='NATIVE_MANIFEST_INVALID'):
    if not ok:
        raise ValueError(code)

def identity(raw):
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}

def policy(request=None):
    result = {key: (request or {}).get(key, value) for key, value in LIMITS.items()}
    need(all(type(value) is int and 0 < value <= LIMITS[key] for key, value in result.items()), 'NATIVE_MANIFEST_LIMIT')
    return result

def scan(raw, limit):
    need(len(raw) <= limit['encodedBytes'], 'NATIVE_MANIFEST_LIMIT')
    need(len(raw)*6 <= limit['workBytes'], 'NATIVE_MANIFEST_WORK')
    raw.decode('utf-8', errors='strict')
    paths = [(), ('transportVersion',), ('expanded',), ('root',), ('slots',)]
    for slot in SCHEMA['slots']:
        paths.extend(('root', *path) for path in slot['paths'])
    for index in range(6):
        paths.extend(('slots', str(index), *path) for path in [(), ('kind',), ('value',)])
    trie = {}
    for path in paths:
        node = trie
        for key in path:
            node = node.setdefault(key, {})
        node[None] = path
    pos = nodes = units = 0
    whitespace = False
    captures = {}
    length = len(raw)
    def byte():
        return raw[pos] if pos < length else -1
    def ws():
        nonlocal pos, whitespace
        while byte() in (9, 10, 13, 32):
            pos += 1
            whitespace = True
    def string():
        nonlocal pos, units
        start = pos
        need(byte() == 34)
        pos += 1
        count = 0
        while pos < length:
            c = raw[pos]
            pos += 1
            if c == 34:
                units += count
                need(units <= limit['utf16'], 'NATIVE_MANIFEST_LIMIT')
                return start, pos, count
            need(c >= 32)
            if c == 92:
                e = byte()
                pos += 1
                if e == 117:
                    need(re.fullmatch(rb'[0-9a-fA-F]{4}', raw[pos:pos+4]) is not None)
                    pos += 4
                else:
                    need(e in (34, 92, 47, 98, 102, 110, 114, 116))
                count += 1
            elif c < 128:
                count += 1
            elif c < 224:
                pos += 1
                count += 1
            elif c < 240:
                pos += 2
                count += 1
            else:
                pos += 3
                count += 2
        need(False)
    def value(depth, node):
        nonlocal pos, nodes
        ws()
        nodes += 1
        need(depth <= limit['depth'] and nodes <= limit['nodes'], 'NATIVE_MANIFEST_LIMIT')
        start, before, unit_start = pos, nodes, units
        max_depth, children = 1, 0
        c = byte()
        if c == 34:
            string()
        elif c in (123, 91):
            pos += 1
            ws()
            obj = c == 123
            end = 125 if obj else 93
            keys = set()
            if byte() != end:
                while True:
                    key = str(children)
                    if obj:
                        a, b, _ = string()
                        key = json.loads(raw[a:b])
                        need(key not in keys, 'NATIVE_MANIFEST_DUPLICATE_KEY')
                        keys.add(key)
                        ws()
                        need(byte() == 58)
                        pos += 1
                    child = value(depth+1, node.get(key) if node is not None else None)
                    max_depth = max(max_depth, child['depth']+1)
                    children += 1
                    ws()
                    if byte() != 44:
                        break
                    pos += 1
                    ws()
            need(byte() == end)
            pos += 1
        elif c in (116, 102, 110):
            literal = {116: b'true', 102: b'false', 110: b'null'}[c]
            need(raw[pos:pos+len(literal)] == literal)
            pos += len(literal)
        else:
            begin = pos
            while byte() in (43, 45, 46, 69, 101) or 48 <= byte() <= 57:
                pos += 1
            token = raw[begin:pos]
            need(re.fullmatch(rb'-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?', token) is not None)
            need(math.isfinite(float(token)))
        result = dict(start=start, end=pos, bytes=pos-start, nodes=nodes-before+1, utf16=units-unit_start, depth=max_depth, children=children)
        if node is not None and None in node:
            captures[node[None]] = result
        return result
    metrics = value(1, trie)
    ws()
    need(pos == length)
    return metrics, captures, whitespace

def read_native_manifest(raw, expected_identity=None, requested=None):
    limit = policy(requested)
    metrics, captures, whitespace = scan(raw, limit)
    transport = identity(raw)
    if expected_identity is not None:
        need(transport['sha256'] == expected_identity['sha256'] and transport['bytes'] == expected_identity.get('bytes', expected_identity.get('byteLength', transport['bytes'])), 'NATIVE_MANIFEST_IDENTITY')
    if ('transportVersion',) not in captures:
        return dict(transport=transport, original=transport, manifest=json.loads(raw), transportVersion=None)
    need(not whitespace, 'NATIVE_MANIFEST_WIRE_WHITESPACE')
    def token(path):
        value = captures.get(tuple(path))
        need(value is not None)
        return json.loads(raw[value['start']:value['end']])
    need(metrics['children'] == 4 and token(['transportVersion']) == VERSION)
    declared = token(['expanded'])
    need(type(declared) is dict and set(declared) == {'sha256', 'bytes', 'nodes', 'utf16', 'depth'})
    need(type(declared['sha256']) is str and re.fullmatch('[a-f0-9]{64}', declared['sha256']) is not None)
    root, slots = captures.get(('root',)), captures.get(('slots',))
    need(root and slots and slots['children'] <= 6 and raw[root['start']] == 123 and raw[slots['start']] == 91)
    expanded = {key: root[key] for key in ('bytes', 'nodes', 'utf16', 'depth')}
    replacements, selected, previous = [], set(), -1
    for i in range(slots['children']):
        need(captures[('slots', str(i))]['children'] == 2)
        kind = token(['slots', str(i), 'kind'])
        index = next((j for j, slot in enumerate(SCHEMA['slots']) if slot['kind'] == kind), -1)
        need(index > previous)
        previous = index
        selected.add(kind)
        v = captures.get(('slots', str(i), 'value'))
        need(v and raw[v['start']:v['end']] != b'null')
        for path in SCHEMA['slots'][index]['paths']:
            target = captures.get(('root', *path))
            need(target and raw[target['start']:target['end']] == b'null')
            replacements.append((target, v))
            expanded['bytes'] += v['bytes']-4
            expanded['nodes'] += v['nodes']-1
            expanded['utf16'] += v['utf16']
            expanded['depth'] = max(expanded['depth'], len(path)+v['depth'])
    for slot in SCHEMA['slots']:
        if slot['kind'] not in selected:
            for path in slot['paths']:
                target = captures.get(('root', *path))
                need(not target or raw[target['start']:target['end']] != b'null')
    for key in expanded:
        need(type(declared[key]) is int and declared[key] == expanded[key] and expanded[key] <= limit['expandedBytes' if key == 'bytes' else key], 'NATIVE_MANIFEST_EXPANSION_LIMIT')
    need(len(raw)*6+expanded['bytes']*4 <= limit['workBytes'] and metrics['nodes']+expanded['nodes']*3 <= limit['workNodes'], 'NATIVE_MANIFEST_WORK')
    replacements.sort(key=lambda row: row[0]['start'])
    spans, offset = [], root['start']
    for target, v in replacements:
        spans.extend([(offset, target['start']), (v['start'], v['end'])])
        offset = target['end']
    spans.append((offset, root['end']))
    view = memoryview(raw)
    digest = hashlib.sha256()
    for a, b in spans:
        digest.update(view[a:b])
    need(digest.hexdigest() == declared['sha256'], 'NATIVE_MANIFEST_EXPANDED_IDENTITY')
    expanded_raw = b''.join(view[a:b] for a, b in spans)
    need(len(expanded_raw) == expanded['bytes'])
    return dict(transport=transport, original={'sha256': declared['sha256'], 'bytes': expanded['bytes']}, manifest=json.loads(expanded_raw), transportVersion=VERSION, metrics=expanded)

def read_native_manifest_file(path, expected_identity=None, requested=None):
    limit = policy(requested)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= limit['encodedBytes'], 'NATIVE_MANIFEST_LIMIT')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(before.st_size+1)
        after = os.fstat(fd)
        terminal = os.stat(path, follow_symlinks=False)
        need(stat.S_ISREG(terminal.st_mode) and terminal.st_dev == before.st_dev and terminal.st_ino == before.st_ino, 'NATIVE_MANIFEST_CHANGED')
        need(len(raw) == before.st_size == after.st_size and before.st_mtime_ns == after.st_mtime_ns and before.st_ctime_ns == after.st_ctime_ns, 'NATIVE_MANIFEST_CHANGED')
        return dict(read_native_manifest(raw, expected_identity, requested), raw=raw)
    finally:
        os.close(fd)
