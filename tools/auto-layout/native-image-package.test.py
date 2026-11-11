import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('coverage', Path(__file__).with_name('object-coverage.py'))
coverage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coverage)
probe = root / 'evidence/native-probe'
deck = probe / 'probe.pptx'
manifest = json.loads((probe / 'manifest.json').read_text())
result = coverage.inspect(deck, manifest)
assert len(result['objects']) == 3
assert len({item['elementId'] for item in result['objects']}) == 3
assert result['objects'][0]['embeddedSha256'] == result['objects'][2]['embeddedSha256']
assert result['objects'][0]['elementId'] != result['objects'][2]['elementId']
(probe / 'object-coverage.json').write_text(json.dumps(result, indent=2) + '\n')
checks = [{'name': 'Actual package names, distinct occurrences, exact placements, geometry, image relationships and unchanged bytes', 'status': 'pass'}]
with zipfile.ZipFile(deck) as archive:
    original = {name: archive.read(name) for name in archive.namelist()}

def reject(name, code, mutate):
    entries = original.copy()
    changed_manifest = copy.deepcopy(manifest)
    slide = ET.fromstring(entries['ppt/slides/slide1.xml'])
    mutate(slide, changed_manifest, entries)
    entries['ppt/slides/slide1.xml'] = ET.tostring(slide)
    altered = probe / (name + '.tampered.pptx')
    with zipfile.ZipFile(altered, 'w', zipfile.ZIP_DEFLATED) as archive:
        for member, raw in entries.items():
            archive.writestr(member, raw)
    try:
        coverage.inspect(altered, changed_manifest)
    except ValueError as error:
        assert code in str(error), str(error)
        checks.append({'name': name, 'status': 'pass', 'rejected': str(error)})
    else:
        raise AssertionError(name + ' unexpectedly passed')

ns = coverage.NS
names = lambda slide: slide.findall('.//p:nvPicPr/p:cNvPr', ns)
reject('empty-picture-name', 'native-object-name', lambda slide, manifest, entries: names(slide)[0].set('name', ''))
reject('missing-picture-name', 'native-object-name', lambda slide, manifest, entries: names(slide)[0].attrib.pop('name'))
reject('duplicate-picture-name', 'native-object-name', lambda slide, manifest, entries: names(slide)[1].set('name', names(slide)[0].get('name')))
def swap(slide, manifest, entries):
    first, second = names(slide)[:2]
    a, b = first.get('name'), second.get('name')
    first.set('name', b)
    second.set('name', a)
reject('swapped-picture-names', 'native-geometry-changed', swap)
reject('wrong-occurrence-placement', 'placement-object-missing', lambda slide, manifest, entries: manifest['placements'][0].__setitem__('occurrenceId', 'wrong-occurrence'))
reject('wrong-source-placement', 'placement-content-changed', lambda slide, manifest, entries: manifest['placements'][0].__setitem__('imageIds', ['other-source']))
print(json.dumps({'passed': len(checks), 'scope': 'One actual package plus deliberately tampered rejection controls. No additional runtime package exports.', 'results': checks}, indent=2))
