import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('coverage', Path(__file__).with_name('object-coverage.py'))
coverage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coverage)
ns = coverage.NS
for k, v in ns.items():
    ET.register_namespace(k, v)
def tag(k, value):
    return '{'+ns[k]+'}'+value

def package_fixture(manifest, output):
    doc = ET.Element(tag('p', 'presentation'))
    ids = ET.SubElement(doc, tag('p', 'sldIdLst'))
    rels = ET.Element('Relationships')
    with zipfile.ZipFile(output, 'w') as archive:
        for n, page in enumerate(manifest['slides'], 1):
            ET.SubElement(ids, tag('p', 'sldId'), {'id': str(n), tag('r', 'id'): f's{n}'})
            ET.SubElement(rels, 'Relationship', {'Id': f's{n}', 'Target': f'slides/slide{n}.xml'})
            slide = ET.Element(tag('p', 'sld'))
            tree = ET.SubElement(ET.SubElement(slide, tag('p', 'cSld')), tag('p', 'spTree'))
            images = ET.Element('Relationships')
            for i, e in enumerate(page['elements'], 1):
                picture = e['type'] == 'image'
                obj = ET.SubElement(tree, tag('p', 'pic' if picture else 'sp'))
                nv = ET.SubElement(obj, tag('p', 'nvPicPr' if picture else 'nvSpPr'))
                ET.SubElement(nv, tag('p', 'cNvPr'), {'id': str(i), 'name': e['id']})
                props = ET.SubElement(obj, tag('p', 'spPr'))
                transform = ET.SubElement(props, tag('a', 'xfrm'))
                ET.SubElement(transform, tag('a', 'off'), {k: str(round(e[k]*9525)) for k in ('x', 'y')})
                ET.SubElement(transform, tag('a', 'ext'), {'cx': str(round(e['w']*9525)), 'cy': str(round(e['h']*9525))})
                if picture:
                    member = f'media/p{n}-{i}.png'
                    ET.SubElement(ET.SubElement(obj, tag('p', 'blipFill')), tag('a', 'blip'), {tag('r', 'embed'): f'i{i}'})
                    ET.SubElement(images, 'Relationship', {'Id': f'i{i}', 'Target': '../'+member})
                    archive.writestr('ppt/'+member, Path(manifest['imageResources'][e['assetId']]['file']).read_bytes())
                elif e['type'] == 'text':
                    body = ET.SubElement(obj, tag('p', 'txBody'))
                    for line in e['text'].split('\n'):
                        paragraph = ET.SubElement(body, tag('a', 'p'))
                        run = ET.SubElement(paragraph, tag('a', 'r'))
                        ET.SubElement(run, tag('a', 'rPr'), {'sz': str(round(e['size']*75))})
                        ET.SubElement(run, tag('a', 't')).text = line
            archive.writestr(f'ppt/slides/slide{n}.xml', ET.tostring(slide))
            archive.writestr(f'ppt/slides/_rels/slide{n}.xml.rels', ET.tostring(images))
        archive.writestr('ppt/presentation.xml', ET.tostring(doc))
        archive.writestr('ppt/_rels/presentation.xml.rels', ET.tostring(rels))

manifest = json.loads((root/'evidence/v2-synthetic-editorial-plan.json').read_text())
results = []
with tempfile.TemporaryDirectory(prefix='material-native-test-') as directory:
    output = Path(directory)/'synthetic-native-objects.zip'
    package_fixture(manifest, output)
    observed = coverage.inspect(output, manifest)
    results.append({'name': 'synthetic ZIP native editable exact fragment/range/scope and affected image/claim objects', 'status': 'pass', 'objects': len(observed['objects'])})
    def reject(name, mutate, code):
        m = copy.deepcopy(manifest)
        mutate(m)
        package_fixture(m, output)
        try:
            coverage.inspect(output, m)
        except ValueError as error:
            assert code in str(error), str(error)
            results.append({'name': name, 'status': 'pass', 'rejection': str(error)})
        else:
            raise AssertionError(name)
    def material_element(m):
        return next(e for p in m['slides'] for e in p['elements'] if e.get('contentRefs', {}).get('materialPlacements'))
    def alter_ref(m):
        e = material_element(m)
        e['contentRefs']['materialPlacements'][0]['fragments'][0]['nativeRange']['start'] += 1
        next(p for p in m['placements'] if p['elementId'] == e['id'])['materialPlacements'] = e['contentRefs']['materialPlacements']
    reject('wrong native source range cannot satisfy exact material', alter_ref, 'material-native-fragment')
    def alter_scope(m):
        e = material_element(m)
        e['contentRefs']['materialPlacements'][0]['occurrenceScopeKeys'] = ['fabricated']
        next(p for p in m['placements'] if p['elementId'] == e['id'])['materialPlacements'] = e['contentRefs']['materialPlacements']
    reject('fabricated scope cannot satisfy material', alter_scope, 'material-scope-changed')
    reject('off canvas native qualifier rejected', lambda m: material_element(m).__setitem__('x', -50), 'off-canvas-object')
    def notes_only(m):
        for p in m['slides']:
            for e in p['elements']:
                if e.get('contentRefs', {}).get('materialPlacements'):
                    e['contentRefs']['materialPlacements'] = []
                    next(x for x in m['placements'] if x['elementId'] == e['id'])['materialPlacements'] = []
    reject('notes or unbound text cannot replace actual material placement', notes_only, 'material-local-fragment-missing')
(root/'evidence/material-native-tests.json').write_text(json.dumps({'scope': 'Synthetic ZIP XML fixtures only. No new PPTX export, native render or project authority.', 'results': results}, indent=2))
print(json.dumps({'passed': len(results)}))
