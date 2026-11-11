from native_manifest import read_native_manifest_file

def bind_transport(report, checked):
    if checked['transportVersion']:
        report.update(semanticCoverageVersion=report['schemaVersion'], schemaVersion='native-object-coverage-v3', layoutTransport=checked['transport'], layoutOriginal=checked['original'])

import argparse
import importlib.util
import sys
import hashlib
import math
import json
from pathlib import Path, PurePosixPath
import posixpath
import xml.etree.ElementTree as ET
import zipfile

COVERAGE_POLICY = json.loads((Path(__file__).parent/'native-coverage-policy.json').read_text())

def emit_numeric(report, checked, stream):
    if checked['transportVersion']:
        require(report.get('schemaVersion') == COVERAGE_POLICY['completeVersion'] and report.get('semanticCoverageVersion') == COVERAGE_POLICY['semanticVersion'] and report.get('layoutTransport') == checked['transport'] and report.get('layoutOriginal') == checked['original'], 'numeric-version-tuple', 'Exact transported numeric coverage required')
        encoder = json.JSONEncoder(ensure_ascii=False, separators=(',', ':'))
        total = 1
        for chunk in encoder.iterencode(report):
            total += len(chunk.encode('utf-8'))
            require(total <= COVERAGE_POLICY['completeNumericOutputBytes'], 'numeric-output-bound', 'Maximum 16 MiB including LF')
        for chunk in encoder.iterencode(report):
            stream.write(chunk)
        stream.write('\n')
    else:
        require(report.get('schemaVersion') == COVERAGE_POLICY['semanticVersion'], 'numeric-version-tuple', 'Exact plain numeric coverage required')
        output = json.dumps(report, ensure_ascii=False)
        require(len(output.encode()) <= COVERAGE_POLICY['legacyNumericOutputBytes'], 'numeric-output-bound', 'Maximum 8 MiB')
        print(output, file=stream)

NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def require(ok, code, detail):
    if not ok:
        raise ValueError(f'{code}: {detail}')

def member_from(base, target):
    return target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(base), target))

def text_body(body):
    lines = []
    for p in body.findall('a:p', NS):
        out = []
        for child in p:
            if child.tag == '{'+NS['a']+'}r':
                out.extend(t.text or '' for t in child.findall('a:t', NS))
            elif child.tag == '{'+NS['a']+'}br':
                out.append('\n')
            elif child.tag == '{'+NS['a']+'}fld':
                raise ValueError('Unsupported native text field')
        lines.append(''.join(out))
    return '\n'.join(lines)

def planned_wrapping(element):
    source = element['sourceText']
    insertions = element['wrapBreaks']
    require(insertions == sorted(set(insertions)), 'wrap-map', element['id'])
    raw = source.encode('utf-16-le')
    parts, previous = [], 0
    for position in insertions:
        require(0 <= position <= len(raw)//2, 'wrap-offset', element['id'])
        parts.append(raw[previous*2:position*2].decode('utf-16-le'))
        parts.append('\n')
        previous = position
    parts.append(raw[previous*2:].decode('utf-16-le'))
    return ''.join(parts)

def effective_run_sizes(body, name):
    sizes = []
    for paragraph in body.findall('a:p', NS):
        props = paragraph.find('a:pPr', NS)
        level = props.get('lvl', '0') if props is not None else '0'
        require(level.isdigit() and 0 <= int(level) <= 8, 'native-font-level', name)
        defaults = [paragraph.find('a:pPr/a:defRPr', NS),
                    body.find(f'a:lstStyle/a:lvl{int(level)+1}pPr/a:defRPr', NS),
                    body.find('a:lstStyle/a:defPPr/a:defRPr', NS)]
        for run in paragraph.findall('a:r', NS):
            if not any(text.text for text in run.findall('a:t', NS)):
                continue
            candidates = [run.find('a:rPr', NS), *defaults]
            size = next((item.get('sz') for item in candidates if item is not None and item.get('sz') is not None), None)
            require(size is not None, 'native-font-size-unresolved', name)
            require(size.isdigit() and int(size) > 0, 'native-font-size-invalid', name)
            sizes.append(int(size)/75)
    return sizes

def utf16_slice(text, span):
    return text.encode('utf-16-le')[span['start']*2:span['end']*2].decode('utf-16-le')

def inspect_material_placements(semantic, records, placements, numeric=False):
    if semantic.get('manuscriptVersion') != ('complete-manuscript-v3' if numeric else 'complete-manuscript-v2'):
        return
    requirements = semantic['clausePlacements']
    for clause_id, clause in semantic['clausesById'].items():
        original = next((c for c in semantic['source']['visibility']['clauses'] if c['clauseId'] == clause_id), None)
        require(original is not None, 'material-original-clause', clause_id)
        content = original['content']
        keys = {'exact_string': ['text'], 'reading_uncertainty': ['text'], 'finding': ['impact', 'acceptance'], 'dimension_unknown': ['reason'], 'comparison_unknown': ['reason']}.get(content['variant'])
        require(keys is not None and clause['fragments'] == [content[k] for k in keys], 'material-original-content', clause_id)
    for block_id, block in semantic['blocksById'].items():
        original = next((b for b in semantic['manuscript']['narrativeBlocks'] if b['id'] == block_id), None)
        require(original is not None and block['text'] == original['text'], 'material-manuscript-block', block_id)
    require(requirements == semantic['manuscript']['clausePlacements'], 'material-manuscript-binding', 'Exact approved placements required')
    for record in records:
        for ref in (record['contentRefs'] or {}).get('materialPlacements', []):
            index = ref['placementIndex']
            require(isinstance(index, int) and 0 <= index < len(requirements), 'material-placement-index', index)
            p = requirements[index]
            require(ref['clauseId'] == p['clauseId'] and ref['occurrenceScopeKeys'] == p['occurrenceScopeKeys'], 'material-scope-changed', index)
            require(record['type'] == 'text', 'material-not-editable-text', record['elementId'])
            clause = semantic['clausesById'][p['clauseId']]
            for fragment in ref['fragments']:
                n = fragment['fragmentIndex']
                require(0 <= n < len(clause['fragments']) and fragment['sourceRange'] == p['exactFragmentRanges'][n], 'material-source-range', index)
                require(utf16_slice(semantic['blocksById'][p['blockId']]['text'], fragment['sourceRange']) == clause['fragments'][n], 'material-original-fragment', index)
                span = fragment['nativeRange']
                require(0 <= span['start'] < span['end'] <= len(record['sourceText'].encode('utf-16-le'))//2 and utf16_slice(record['sourceText'], span) == clause['fragments'][n], 'material-native-fragment', record['elementId'])
            intent_ids = {x['intentId'] for x in placements if x['elementId'] == record['elementId']}
            require(any(i in p['pageIntentIds'] for i in intent_ids), 'material-intent-changed', index)
            require(any(r['slideId'] == record['slideId'] and (r.get('imageId') in p['affectedImageIds'] or any(b in p['affectedBlockIds'] for b in (r['contentRefs'] or {}).get('blockIds', []))) for r in records), 'material-unused-scope', index)
    for index, p in enumerate(requirements):
        clause = semantic['clausesById'][p['clauseId']]
        for intent_id in p['pageIntentIds']:
            actual = [r for r in records if any(x['elementId'] == r['elementId'] and x['intentId'] == intent_id for x in placements)]
            affected = {r['slideId'] for r in actual if r.get('imageId') in p['affectedImageIds'] or any(b in p['affectedBlockIds'] for b in (r['contentRefs'] or {}).get('blockIds', []))}
            require(affected, 'material-target-missing', index)
            for slide_id in affected:
                for n, exact in enumerate(clause['fragments']):
                    require(any(r['slideId'] == slide_id and r['type'] == 'text' and any(ref['placementIndex'] == index and any(f['fragmentIndex'] == n and utf16_slice(r['sourceText'], f['nativeRange']) == exact for f in ref['fragments']) for ref in (r['contentRefs'] or {}).get('materialPlacements', [])) for r in actual), 'material-local-fragment-missing', f'{index} on {slide_id}')

def application_carrier(art, records, resources, picture_states):
    resource = resources[art['imageId']]
    application = resource.get('application')
    if application is None:
        return None
    require(isinstance(application, dict) and application.get('kind') == 'rectangular-aperture', 'application-binding', art['elementId'])
    carrier_id = application.get('mockupId')
    carrier_resource = resources.get(carrier_id)
    require(carrier_id != art['imageId'] and isinstance(carrier_resource, dict) and carrier_resource.get('role') == 'mockup', 'application-carrier-resource', art['elementId'])
    require(isinstance(application.get('purpose'), str) and application['purpose'] and application['purpose'] == carrier_resource.get('purpose'), 'application-purpose', art['elementId'])
    matches = [r for r in records if r['slideId'] == art['slideId'] and r.get('imageId') == carrier_id]
    require(matches, 'application-carrier-occurrence', art['elementId'])
    aperture = carrier_resource.get('aperture')
    require(isinstance(aperture, dict) and set(aperture) == {'x', 'y', 'w', 'h'} and all(type(v) in (int, float) and math.isfinite(v) for v in aperture.values()), 'application-aperture', art['elementId'])
    require(aperture['x'] >= 0 and aperture['y'] >= 0 and aperture['w'] > 0 and aperture['h'] > 0 and aperture['x']+aperture['w'] <= 1 and aperture['y']+aperture['h'] <= 1, 'application-aperture', art['elementId'])
    for value in [resource, carrier_resource]:
        require(all(type(value.get(k)) in (int, float) and math.isfinite(value[k]) and value[k] > 0 for k in ('width', 'height')), 'application-image-dimensions', art['elementId'])
    ratio = (aperture['w']*carrier_resource['width'])/(aperture['h']*carrier_resource['height'])/(resource['width']/resource['height'])
    require(abs(ratio-1) <= .06, 'application-aperture-aspect', art['elementId'])
    def expected_art(carrier):
        x, y, width, height = carrier['geometry']
        slot = [x+width*aperture['x'], y+height*aperture['y'], width*aperture['w'], height*aperture['h']]
        scale = min(slot[2]/resource['width'], slot[3]/resource['height'])
        art_width, art_height = resource['width']*scale, resource['height']*scale
        return [slot[0]+(slot[2]-art_width)/2, slot[1]+(slot[3]-art_height)/2, art_width, art_height]
    aligned = [r for r in matches if all(abs(a-b) <= .15 for a, b in zip(art['geometry'], expected_art(r)))]
    require(aligned, 'application-aperture-geometry', art['elementId'])
    require(len(aligned) == 1, 'application-carrier-occurrence', art['elementId'])
    carrier = aligned[0]
    for image in [art, carrier]:
        state = picture_states[image['elementId']]
        require(not state['cropped'] and not state['rotated'] and not state['flipped'] and not state['tiled'], 'application-image-transform', image['elementId'])
    width, height = carrier['geometry'][2:]
    require(abs(width*carrier_resource['height']-height*carrier_resource['width']) <= .15*(carrier_resource['width']+carrier_resource['height']), 'application-carrier-aspect', carrier['elementId'])
    return carrier['elementId']

def _inspect(deck, manifest, numeric=None):
    if numeric:
        require(deck.stat().st_size <= 32*1024*1024, 'numeric-deck-bound', 'Existing chart package bound')
        with deck.open('rb') as stream:raw=stream.read(32*1024*1024+1)
        require(len(raw) <= 32*1024*1024, 'numeric-deck-bound', 'Existing chart package bound')
    else:
        raw = deck.read_bytes()
    records = []
    picture_states = {}
    with (numeric['core'].archive(raw) if numeric else zipfile.ZipFile(deck)) as archive:
        document = ET.fromstring(archive.read('ppt/presentation.xml'))
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('ppt/_rels/presentation.xml.rels'))}
        slides = document.findall('p:sldIdLst/p:sldId', NS)
        require(len(slides) == len(manifest['slides']), 'slide-count', 'Actual deck differs from planned slide count')
        for page_number, (sid, page) in enumerate(zip(slides, manifest['slides']), 1):
            member = member_from('ppt/presentation.xml', rels[sid.get('{'+NS['r']+'}id')])
            slide = ET.fromstring(archive.read(member))
            wanted = {e['id']: e for e in page['elements']}
            require(len(wanted) == len(page['elements']), 'duplicate-planned-name', page['id'])
            rel_member = str(PurePosixPath(member).parent / '_rels' / (PurePosixPath(member).name + '.rels'))
            image_rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read(rel_member))} if rel_member in archive.namelist() else {}
            observed = set()
            if numeric:
                require(len({e['occurrenceId'] for e in page['elements']}) == len(page['elements']), 'duplicate-object-occurrence', page['id'])
            for container in list(slide.find('p:cSld/p:spTree', NS)):
                chart_frame = numeric is not None and container.tag == '{'+NS['p']+'}graphicFrame'
                if not chart_frame and container.tag not in ('{'+NS['p']+'}sp', '{'+NS['p']+'}pic'):
                    if numeric:
                        require(container.tag in ('{'+NS['p']+'}nvGrpSpPr', '{'+NS['p']+'}grpSpPr'), 'unsupported-container', page['id'])
                    require(container.tag not in ('{'+NS['p']+'}grpSp', '{'+NS['p']+'}graphicFrame'), 'unsupported-container', page['id'])
                    continue
                native = container.find('p:nvSpPr/p:cNvPr', NS) if container.tag.endswith('}sp') else container.find('p:nvPicPr/p:cNvPr', NS)
                if chart_frame:
                    native = container.find('p:nvGraphicFramePr/p:cNvPr', NS)
                require(native is not None, 'native-object-id', page['id'])
                name = native.get('name')
                require(name in wanted and name not in observed, 'native-object-name', f'{page_number}: {name}')
                observed.add(name)
                element = wanted[name]
                require(native.get('hidden', '0') not in ('1', 'true'), 'hidden-object', name)
                require(all(int(a.get('val', '100000')) == 100000 for a in container.findall('.//a:alpha', NS)), 'transparent-object', name)
                if numeric:
                    require(chart_frame == (element['type'] == 'chart') and (container.tag == '{'+NS['p']+'}pic') == (element['type'] == 'image'), 'native-object-type', name)
                xfrm = container.find('p:xfrm' if chart_frame else 'p:spPr/a:xfrm', NS)
                require(xfrm is not None, 'missing-geometry', name)
                off, ext = xfrm.find('a:off', NS), xfrm.find('a:ext', NS)
                geometry = [int(off.get('x'))/9525, int(off.get('y'))/9525, int(ext.get('cx'))/9525, int(ext.get('cy'))/9525]
                expected = [element[k] for k in ('x', 'y', 'w', 'h')]
                require(all(abs(a-b) <= .15 for a, b in zip(geometry, expected)), 'native-geometry-changed', f'{name}: {geometry} != {expected}')
                require(geometry[0] >= 0 and geometry[1] >= 0 and geometry[2] > 0 and geometry[3] >= 0 and geometry[0]+geometry[2] <= manifest['width']+.15 and geometry[1]+geometry[3] <= manifest['height']+.15, 'off-canvas-object', name)
                record = {'slide': page_number, 'slideId': page['id'], 'elementId': name, 'nativeShapeId': native.get('id'), 'type': element['type'], 'occurrenceId': element['occurrenceId'], 'contentRefs': element.get('contentRefs'), 'geometry': geometry}
                if element['type'] == 'text':
                    body = container.find('p:txBody', NS)
                    require(body is not None, 'missing-editable-text', name)
                    actual = text_body(body)
                    metadata = numeric['metadata'].get(name) if numeric else None
                    expected_text = numeric['core'].metadata_display(element['sourceText'], element['wrapBreaks'])[0] if metadata else element['text']
                    require(actual == expected_text, 'native-text-changed', f'{name}: {actual!r} != {expected_text!r}')
                    if 'wrapBreaks' in element and not metadata:
                        require(planned_wrapping(element) == actual, 'source-wrap-changed', name)
                    sizes = effective_run_sizes(body, name)
                    require(sizes and all(abs(s-element['size']) < .15 for s in sizes), 'native-font-size', name)
                    record['effectiveRunSizes'] = sizes
                    record['text'] = actual
                    record['sourceText'] = element['sourceText']
                    record['textSha256'] = digest(actual.encode('utf8'))
                    record['sourceTextSha256'] = digest(element['sourceText'].encode('utf8'))
                    if metadata:
                        record['metadataDisplay'] = metadata_display_evidence(numeric['core'], element, metadata, manifest['semanticContent'], numeric['textPolicy'])
                elif element['type'] == 'image':
                    picture_states[name] = {
                        'cropped': any(v not in ('0', '0%') for node in [*container.findall('p:blipFill/a:srcRect', NS), *container.findall('p:blipFill/a:stretch/a:fillRect', NS)] for v in node.attrib.values()),
                        'tiled': container.find('p:blipFill/a:tile', NS) is not None,
                        'rotated': xfrm.get('rot', '0') != '0',
                        'flipped': any(xfrm.get(k, '0') not in ('0', 'false') for k in ('flipH', 'flipV')),
                    }
                    blip = container.find('.//a:blip', NS)
                    rid = blip.get('{'+NS['r']+'}embed') if blip is not None else None
                    require(rid in image_rels, 'native-image-relationship', name)
                    media_member = member_from(member, image_rels[rid])
                    media = archive.read(media_member)
                    expected_asset = manifest['imageResources'][element['assetId']]
                    require(digest(media) == expected_asset['sha256'], 'native-image-bytes', f'{name}: unexpected transformation or substituted image')
                    record.update({'imageId': element['assetId'], 'relationshipId': rid, 'mediaMember': media_member, 'embeddedSha256': digest(media), 'byteCount': len(media)})
                elif element['type'] == 'chart' and numeric:
                    occurrence = numeric['occurrences'].get(name)
                    require(occurrence and occurrence['slidePart'] == member and occurrence['slideNumber'] == page_number and occurrence['nativeShapeId'] == native.get('id') and occurrence['elementOccurrenceId'] == element['occurrenceId'], 'chart-object-bijection', name)
                    require(element['chartRef']['occurrenceId'] == occurrence['authoredOccurrenceId'] and element['chartRef']['pageIntentId'] == occurrence['pageIntentId'] and all(element['chartRef'].get(k) == v for k,v in occurrence['identity'].items()), 'chart-object-reference', name)
                    record.update({'chartRef':element['chartRef'], 'nativeOccurrence':occurrence})
                records.append(record)
            require(observed == set(wanted), 'missing-native-objects', sorted(set(wanted)-observed))
    by_id = {r['elementId']: r for r in records}
    carriers = {r['elementId']: application_carrier(r, records, manifest['imageResources'], picture_states) for r in records if r['type'] == 'image'}
    if numeric:
        require(len(by_id) == len(records) and len({r['occurrenceId'] for r in records}) == len(records), 'duplicate-object-occurrence', 'Global native identity required')
        require({r['elementId'] for r in records if r['type'] == 'chart'} == set(numeric['occurrences']), 'chart-object-bijection', 'Complete actual chart union required')
    placements = manifest['placements']
    require(len({p['occurrenceId'] for p in placements}) == len(placements), 'duplicate-placement', 'Occurrence mapping must be unique')
    for placement in placements:
        obj = by_id.get(placement['elementId'])
        require(obj and obj['occurrenceId'] == placement['occurrenceId'] and obj['slideId'] == placement['slideId'], 'placement-object-missing', placement['elementId'])
        for key, value in obj['contentRefs'].items():
            require(placement.get(key) == value, 'placement-content-changed', placement['elementId'])
    if numeric:
        require(len({p['elementId'] for p in placements}) == len(placements) and {p['elementId'] for p in placements} == {r['elementId'] for r in records if r['contentRefs']}, 'placement-object-bijection', 'Every native content reference needs one placement')
    semantic = manifest['semanticContent']
    if semantic.get('contentBinding'):
        require(any((r['contentRefs'] or {}).get('manuscriptTitle') and r.get('sourceText') == semantic['title'] for r in records), 'manuscript-title-missing', 'Exact original manuscript title must remain native text')
    for intent in semantic['intents']:
        if intent['kind'] != 'narrative':
            continue
        actual = [r for r in records if any(p['elementId'] == r['elementId'] and p['intentId'] == intent['id'] for p in placements)]
        slide_ids = {r['slideId'] for r in actual}
        for slide_id in slide_ids:
            if intent.get('central', {}).get('kind') == 'image':
                hero = [r for r in actual if r['slideId'] == slide_id and r.get('imageId') == intent['central']['imageId'] and (r['contentRefs'] or {}).get('centralImageIntentId') == intent['id']]
                require(len(hero) == 1, 'central-image-missing', slide_id)
                area = hero[0]['geometry'][2]*hero[0]['geometry'][3]
                require(all(area > r['geometry'][2]*r['geometry'][3] for r in actual if r['slideId'] == slide_id and r['type'] == 'image' and r['elementId'] not in (hero[0]['elementId'], carriers.get(hero[0]['elementId']))), 'central-image-prominence', slide_id)
                continue
            require(any(r['slideId'] == slide_id and ((r['contentRefs'] or {}).get('centralMessageIntentId') == intent['id'] or numeric is not None and any(c['pageIntentId'] == intent['id'] and c['authoredOccurrenceId'] == (r['contentRefs'] or {}).get('chartOccurrenceId') for c in numeric['occurrences'].values())) and r.get('sourceText') == intent['centralMessage'] for r in actual), 'central-message-missing', slide_id)
        for block_id in intent['blockIds']:
            block = semantic['blocksById'][block_id]
            require(any(block_id in (r['contentRefs'] or {}).get('blockIds', []) and r.get('sourceText') == block['text'] for r in actual), 'exact-block-missing', block_id)
        for image_id in intent['imageIds']:
            require(any(r.get('imageId') == image_id for r in actual), 'required-image-missing', image_id)
        for origin_id, obligation in semantic['obligationsByOrigin'].items():
            if intent['id'] not in obligation['pageIntentIds']:
                continue
            if obligation['kind'] == 'image':
                require(any(r.get('imageId') == obligation['value']['imageId'] and origin_id in r['contentRefs']['obligationOrigins'] for r in actual), 'obligation-image-missing', origin_id)
            else:
                require(any(origin_id in (r['contentRefs'] or {}).get('obligationOrigins', []) and obligation['exactText'] in r.get('sourceText', '') and any(b in r['contentRefs']['blockIds'] for b in obligation['blockIds']) for r in actual), 'obligation-text-missing', origin_id)
            if obligation['kind'] in ('limitation', 'qualification', 'restriction') and obligation['imageIds']:
                for slide_id in slide_ids:
                    if any(r['slideId'] == slide_id and r.get('imageId') in obligation['imageIds'] for r in actual):
                        require(any(r['slideId'] == slide_id and origin_id in (r['contentRefs'] or {}).get('obligationOrigins', []) and obligation['exactText'] in r.get('sourceText', '') for r in actual), 'local-image-qualification-missing', f'{origin_id} on {slide_id}')
    inspect_material_placements(semantic, records, placements, numeric=numeric is not None)
    return {'schemaVersion': 'native-object-coverage-v1', 'authority': 'technical-evidence-only-no-project-approval', 'deckSha256': digest(raw), 'manifestSha256': digest(json.dumps(manifest, ensure_ascii=False).encode()), 'slideCount': len(manifest['slides']), 'contentBinding': manifest.get('contentBinding'), 'objects': records, 'placements': manifest['placements']}

def inspect(deck, manifest):
    return _inspect(deck, manifest)

def metadata_display_evidence(core, element, metadata, semantic, text_policy):
    source = element['sourceText']
    display, segments = core.metadata_display(source, element['wrapBreaks'])
    require(metadata['displayMapping'] == segments and metadata['mappingHash'] == core.program_hash({'textPolicy':text_policy,'segments':segments}), 'metadata-mapping-changed', element['id'])
    units = source.encode('utf-16-le')
    def boundary(n):
        require(type(n) is int and 0 <= n <= len(units)//2, 'metadata-source-boundary', element['id'])
        try:
            units[:n*2].decode('utf-16-le')
        except UnicodeDecodeError:
            raise ValueError('metadata-source-boundary: '+element['id']) from None
        require(not (0 < n < len(units)//2 and units[(n-1)*2:n*2] == b'\r\x00' and units[n*2:(n+1)*2] == b'\n\x00'), 'metadata-source-boundary', element['id'])
    anchors=[]
    for ref in element['contentRefs']['chartMetadata']:
        start,end=ref['start'],ref['end'];boundary(start);boundary(end)
        require(start < end and semantic['blocksById'][ref['blockId']]['text'] == source, 'metadata-original-block', element['id'])
        ranges=[]
        for segment in segments:
            lo,hi=max(start,segment['sourceStart']),min(end,segment['sourceEnd'])
            if lo >= hi or segment['kind'] == 'wrap':continue
            if segment['kind'] == 'copy':
                begin=segment['displayStart']+lo-segment['sourceStart'];finish=begin+hi-lo
            else:
                require(lo == segment['sourceStart'] and hi == segment['sourceEnd'], 'metadata-source-boundary', element['id'])
                begin,finish=segment['displayStart'],segment['displayEnd']
            ranges.append({'start':begin,'end':finish})
        anchors.append({**ref,'displayRanges':ranges})
    return {'sourceTextSha256':digest(source.encode()),'measuredTextSha256':digest(element['text'].encode()),'displayTextSha256':digest(display.encode()),'textPolicy':text_policy,'mappingHash':metadata['mappingHash'],'displayMapping':segments,'sourceAnchors':anchors}

def inspect_numeric(deck, manifest, chart_evidence):
    spec=importlib.util.spec_from_file_location('chart_package_core',Path(__file__).parent/'native-charts/chart-package-verify.py')
    core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
    core.closed(chart_evidence,'program manifest proof')
    program=chart_evidence['program']
    require(program.get('textPolicy') in core.TEXT_POLICIES, 'numeric-text-policy', 'Current source/display contract required')
    proof=core.verify_occurrences(deck,program,chart_evidence['manifest'],strict_roots=True)
    require(proof == chart_evidence['proof'], 'numeric-stale-proof', 'Actual package must match fresh source-bound proof')
    occurrences={row['elementId']:row for row in proof['occurrences']}
    metadata={meta['elementId']:meta for row in proof['occurrences'] for meta in row['metadata']}
    require(len(occurrences) == len(proof['occurrences']) and len(metadata) == sum(len(r['metadata']) for r in proof['occurrences']), 'numeric-occurrence-union', 'Unique actual occurrences required')
    report=_inspect(deck,manifest,{'core':core,'occurrences':occurrences,'metadata':metadata,'textPolicy':program['textPolicy']})
    require(report['deckSha256'] == proof['packageHash'], 'numeric-deck-changed', 'Stable package required')
    with deck.open('rb') as stream:terminal=stream.read(32*1024*1024+1)
    require(len(terminal) <= 32*1024*1024 and digest(terminal) == proof['packageHash'], 'numeric-deck-changed', 'Stable package required')
    report.update({'schemaVersion':'native-object-coverage-v2','chartProgramHash':proof['programHash'],'chartOccurrences':proof['occurrences'],'pdfFontRegionsVerified':False,'nativeExecutionAvailable':False})
    return report

if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--numeric-stdin':
        raw=sys.stdin.buffer.read(8*1024*1024+1)
        require(len(raw) <= 8*1024*1024, 'numeric-input-bound', 'Maximum 8 MiB')
        payload=json.loads(raw)
        require(set(payload) == {'chartEvidence','manifestSha256','chartProofSha256'}, 'numeric-input-schema', 'Internal source-bound owner protocol')
        manifest_path=Path(sys.argv[3])
        checked=read_native_manifest_file(manifest_path, {'sha256':payload['manifestSha256']})
        report=inspect_numeric(Path(sys.argv[2]),checked['manifest'],payload['chartEvidence'])
        bind_transport(report, checked)
        report.update({key:payload[key] for key in ['manifestSha256','chartProofSha256']})
        emit_numeric(report, checked, sys.stdout)
        sys.exit(0)
    parser = argparse.ArgumentParser()
    parser.add_argument('--deck', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    manifest_path = Path(args.manifest)
    checked = read_native_manifest_file(manifest_path)
    report = inspect(Path(args.deck), checked['manifest'])
    report['manifestSha256'] = checked['transport']['sha256']
    bind_transport(report, checked)
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'slideCount': report['slideCount'], 'objectCount': len(report['objects'])}))
