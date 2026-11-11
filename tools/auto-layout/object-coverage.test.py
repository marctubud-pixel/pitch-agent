import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET
import zipfile

spec = importlib.util.spec_from_file_location('coverage', Path(__file__).with_name('object-coverage.py'))
coverage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coverage)
NS = coverage.NS
for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)

def tag(prefix, local):
    return '{'+NS[prefix]+'}'+local

def text_shape(tree, name, text, x=60):
    sp = ET.SubElement(tree, tag('p', 'sp'))
    nv = ET.SubElement(sp, tag('p', 'nvSpPr'))
    ET.SubElement(nv, tag('p', 'cNvPr'), {'id': str(len(tree)), 'name': name})
    props = ET.SubElement(sp, tag('p', 'spPr'))
    xfrm = ET.SubElement(props, tag('a', 'xfrm'))
    ET.SubElement(xfrm, tag('a', 'off'), {'x': str(x*9525), 'y': str(80*9525)})
    ET.SubElement(xfrm, tag('a', 'ext'), {'cx': str(1000*9525), 'cy': str(100*9525)})
    body = ET.SubElement(sp, tag('p', 'txBody'))
    for line in text.split('\n'):
        p = ET.SubElement(body, tag('a', 'p'))
        run = ET.SubElement(p, tag('a', 'r'))
        ET.SubElement(run, tag('a', 'rPr'), {'sz': '1800'})
        ET.SubElement(run, tag('a', 't')).text = line
    return sp

def image_shape(tree):
    pic = ET.SubElement(tree, tag('p', 'pic'))
    nv = ET.SubElement(pic, tag('p', 'nvPicPr'))
    ET.SubElement(nv, tag('p', 'cNvPr'), {'id': '3', 'name': 'image'})
    props = ET.SubElement(pic, tag('p', 'spPr'))
    xfrm = ET.SubElement(props, tag('a', 'xfrm'))
    ET.SubElement(xfrm, tag('a', 'off'), {'x': str(60*9525), 'y': str(80*9525)})
    ET.SubElement(xfrm, tag('a', 'ext'), {'cx': str(1000*9525), 'cy': str(100*9525)})
    blip = ET.SubElement(pic, tag('p', 'blipFill'))
    ET.SubElement(blip, tag('a', 'blip'), {tag('r', 'embed'): 'image-rel'})

def fixture():
    document = ET.Element(tag('p', 'presentation'))
    ids = ET.SubElement(document, tag('p', 'sldIdLst'))
    ET.SubElement(ids, tag('p', 'sldId'), {'id': '1', tag('r', 'id'): 'slide-rel'})
    slide = ET.Element(tag('p', 'sld'))
    common = ET.SubElement(slide, tag('p', 'cSld'))
    tree = ET.SubElement(common, tag('p', 'spTree'))
    source = 'First  line\nSecond line.'
    wrapped = 'First  \nline\nSecond line.'
    text_shape(tree, 'message', 'Central message')
    text_shape(tree, 'body', wrapped)
    image_shape(tree)
    refs = {'blockIds': ['block-1'], 'imageIds': [], 'sourceIds': [], 'claimOrigins': [], 'obligationOrigins': ['origin-1']}
    central = {**refs, 'blockIds': [], 'obligationOrigins': [], 'centralMessageIntentId': 'intent'}
    image_refs = {**refs, 'blockIds': [], 'imageIds': ['view-1'], 'obligationOrigins': []}
    text_element = {'type': 'text', 'x': 60, 'y': 80, 'w': 1000, 'h': 100, 'size': 24}
    elements = [{**text_element, 'id': 'message', 'occurrenceId': 'message', 'text': 'Central message', 'sourceText': 'Central message', 'wrapBreaks': [], 'contentRefs': central},
                {**text_element, 'id': 'body', 'occurrenceId': 'body', 'text': wrapped, 'sourceText': source, 'wrapBreaks': [7], 'contentRefs': refs},
                {'type': 'image', 'id': 'image', 'occurrenceId': 'image', 'assetId': 'view-1', 'x': 60, 'y': 80, 'w': 1000, 'h': 100, 'contentRefs': image_refs}]
    media = b'Controlled verifier bytes, not a rendered presentation.'
    manifest = {'width': 1280, 'height': 720, 'slides': [{'id': 'slide-1', 'elements': elements}], 'placements': [{'intentId': 'intent', 'slideId': 'slide-1', 'elementId': e['id'], 'occurrenceId': e['occurrenceId'], **e['contentRefs']} for e in elements],
                'imageResources': {'view-1': {'sha256': coverage.digest(media)}},
                'semanticContent': {'intents': [{'kind': 'narrative', 'id': 'intent', 'centralMessage': 'Central message', 'blockIds': ['block-1'], 'imageIds': ['view-1']}], 'blocksById': {'block-1': {'text': source}}, 'obligationsByOrigin': {'origin-1': {'kind': 'text', 'pageIntentIds': ['intent'], 'blockIds': ['block-1'], 'imageIds': [], 'exactText': source}}}}
    return document, slide, manifest, media

def inspect_case(mutate=None):
    document, slide, manifest, media = fixture()
    if mutate:
        media = mutate(slide, manifest, media) or media
    with tempfile.TemporaryDirectory(prefix='synthetic-object-check-', dir='/private/tmp') as directory:
        deck = Path(directory) / 'synthetic-package.zip'
        with zipfile.ZipFile(deck, 'w') as archive:
            archive.writestr('ppt/presentation.xml', ET.tostring(document))
            archive.writestr('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="slide-rel" Target="slides/slide1.xml"/></Relationships>')
            archive.writestr('ppt/slides/slide1.xml', ET.tostring(slide))
            archive.writestr('ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="image-rel" Target="../media/image.png"/></Relationships>')
            archive.writestr('ppt/media/image.png', media)
        return coverage.inspect(deck, manifest)

results = []
def reject(name, code, mutation):
    try:
        inspect_case(mutation)
    except ValueError as error:
        assert code in str(error), str(error)
        results.append({'name': name, 'status': 'pass', 'observed': str(error)})
    else:
        raise AssertionError(name+' unexpectedly passed')

assert len(inspect_case()['objects']) == 3
results.append({'name': 'Exact native shape names, text with original whitespace and explicit wrap offsets, picture relationship and embedded bytes', 'status': 'pass'})
reject('Native wording alteration', 'native-text-changed', lambda s, m, b: s.find('.//a:t', NS).__setattr__('text', 'Rewritten'))
reject('Original newline cannot be discarded as arbitrary transport whitespace', 'source-wrap-changed', lambda s, m, b: m['slides'][0]['elements'][1].__setitem__('sourceText', 'First  line Second line.'))
reject('Hidden text cannot manufacture coverage', 'hidden-object', lambda s, m, b: s.find('.//p:cNvPr', NS).set('hidden', '1'))
reject('Image substitution', 'native-image-bytes', lambda s, m, b: b'substituted')
reject('Wrong original block assignment', 'exact-block-missing', lambda s, m, b: m['semanticContent']['blocksById']['block-1'].__setitem__('text', 'Stronger source'))
reject('Mapping cannot declare an unrelated occurrence', 'placement-content-changed', lambda s, m, b: m['placements'][1].__setitem__('blockIds', ['unrelated']))
reject('Required target view cannot be absent', 'required-image-missing', lambda s, m, b: m['semanticContent']['intents'][0]['imageIds'].append('missing-view'))
def inherit(slide, manifest, media, size, local='paragraph'):
    body = slide.findall('.//p:txBody', NS)[1]
    paragraph = body.find('a:p', NS)
    paragraph.find('a:r/a:rPr', NS).attrib.pop('sz')
    if local == 'paragraph':
        props = ET.SubElement(paragraph, tag('a', 'pPr'))
    else:
        styles = ET.SubElement(body, tag('a', 'lstStyle'))
        props = ET.SubElement(styles, tag('a', 'lvl1pPr' if local == 'level' else 'defPPr'))
    ET.SubElement(props, tag('a', 'defRPr'), {'sz': size})
    return media

reject('Inherited one point run cannot hide behind explicit 18pt sibling', 'native-font-size', lambda s,m,b: inherit(s,m,b,'100'))
reject('Run without resolvable size cannot pass', 'native-font-size-unresolved', lambda s,m,b: s.find('.//a:rPr', NS).attrib.pop('sz'))
for local in ['paragraph', 'level', 'default']:
    assert len(inspect_case(lambda s,m,b: inherit(s,m,b,'1800',local))['objects']) == 3
    results.append({'name': 'Valid '+local+' size inheritance', 'status': 'pass'})
print(json.dumps({'scope': 'Synthetic ZIP/XML inspector controls. No actual PPTX export or rendering.', 'summary': {'passed': len(results)}, 'results': results}, indent=2))
