#!/usr/bin/env python3
from native_manifest import read_native_manifest_file
import argparse
from collections import Counter, defaultdict
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
import zipfile
import importlib.metadata
import importlib.util
import math
import struct
from decimal import Decimal, ROUND_HALF_UP

from pdfminer.converter import PDFPageAggregator
from pdfminer.pdfinterp import PDFPageInterpreter, PDFResourceManager
from pdfminer.pdfpage import PDFPage
from pdfminer.pdftypes import dict_value, stream_value
from pdfminer.pdffont import TrueTypeFont
from pdfminer.utils import mult_matrix
from pdfminer.psparser import literal_name

NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def transport(text):
    return re.sub(r'[ \t\r\n]', '', text)

def canonical(face):
    return re.sub(r'^[A-Z]{6}\+', '', face.lstrip('/'))

def cjk(text):
    return Counter(c for c in text if '\u3400' <= c <= '\u9fff')

class Refusal(Exception):
    def __init__(self, code, detail):
        self.code, self.detail = code, detail
        super().__init__(detail)

def require(condition, code, detail):
    if not condition:
        raise Refusal(code, detail)

def scan_faces(tool, file):
    fmt = '%{family}\x1f%{postscriptname}\x1f%{style}\x1f%{index}\x1f%{weight}\x1f%{file}\x1f%{slant}\x1f%{charset}\n'
    result = subprocess.run([tool, '--format', fmt, str(file)], check=True, capture_output=True, text=True)
    faces = []
    for line in result.stdout.splitlines():
        family, ps, style, index, weight, actual, slant, charset = line.split('\x1f')
        faces.append({'families': family.split(','), 'postscript': ps.split(','), 'style': style,
                      'index': int(index), 'weight': float(weight), 'slant': float(slant), 'charset': charset, 'file': actual})
    require(faces and all(f['postscript'] != [''] for f in faces), 'font-metadata', f'Unresolved metadata: {file}')
    return faces

def source_pages(raw, layout, family, numeric=None):
    require(numeric is not None or 'chartPlacements' not in layout.get('semanticContent', {}), 'numeric-source-owner-required', 'Numeric source needs the canonical source-bound owner')
    pages = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        presentation = ET.fromstring(archive.read('ppt/presentation.xml'))
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('ppt/_rels/presentation.xml.rels'))}
        ids = presentation.findall('p:sldIdLst/p:sldId', NS)
        require(len(ids) == len(layout['slides']), 'slide-count', 'Planned slide count differs from final PPT')
        for index, (sid, planned) in enumerate(zip(ids, layout['slides']), 1):
            target = rels[sid.get('{'+NS['r']+'}id')]
            member = str(PurePosixPath('ppt') / target) if not target.startswith('/') else target.lstrip('/')
            node = ET.fromstring(archive.read(member))
            require(numeric is not None or not node.findall('.//p:graphicFrame', NS), 'unsupported-container', f'Page {index}: graphicFrame text is unsupported')
            require(not node.findall('.//a:fld', NS), 'unsupported-container', f'Page {index}: field text is unsupported')
            wanted = {e.get('id') or f"{planned['id']}-{e['type']}-{i+1}": e
                      for i, e in enumerate(planned['elements']) if e['type'] == 'text'}
            require(len(wanted) == sum(e['type'] == 'text' for e in planned['elements']), 'duplicate-plan-shape', f'Page {index}')
            observed, runs = set(), []
            for shape in node.findall('.//p:sp', NS):
                body = shape.find('p:txBody', NS)
                if body is None:
                    continue
                texts = body.findall('.//a:t', NS)
                if not any(t.text for t in texts):
                    continue
                name = shape.find('p:nvSpPr/p:cNvPr', NS).get('name')
                require(name in wanted and name not in observed, 'native-shape', f'Page {index}: unexpected/duplicate text shape {name}')
                observed.add(name)
                element = wanted[name]
                require(transport(''.join(t.text or '' for t in texts)) == transport(numeric[name]['text'] if numeric else element['text']), 'source-text', f'Page {index}, {name}: final text differs from plan')
                require(not shape.findall('.//a:alpha', NS) or all(int(a.get('val')) == 100000 for a in shape.findall('.//a:alpha', NS)), 'hidden-source-text', f'Page {index}, {name}: transparent text')
                covered = []
                for run in body.findall('.//a:r', NS):
                    text = ''.join(t.text or '' for t in run.findall('a:t', NS))
                    if not text:
                        continue
                    props = run.find('a:rPr', NS)
                    require(props is not None, 'unresolved-source-font', f'Page {index}, {name}: inherited run')
                    for script in ('latin', 'ea', 'cs'):
                        declaration = props.find('a:'+script, NS)
                        require(declaration is not None and declaration.get('typeface') == family, 'unresolved-source-font', f'Page {index}, {name}: {script} must directly declare {family}')
                    bold = props.get('b', '0') in ('1', 'true')
                    require(bold == bool(element.get('bold')), 'source-style', f'Page {index}, {name}: bold intent differs from plan')
                    require(props.get('i', '0') in ('0', 'false'), 'unsupported-source-style', f'Page {index}, {name}: italic is unsupported')
                    runs.append({'shape': name, 'text': text, 'style': 'bold' if bold else 'regular'})
                    covered.append(text)
                require(''.join(covered) == ''.join(t.text or '' for t in texts), 'unsupported-container', f'Page {index}, {name}: text outside supported runs')
            require(observed == set(wanted), 'native-shape', f'Page {index}: missing editable text shapes {sorted(set(wanted)-observed)}')
            pages.append({'page': index, 'runs': runs})
    return pages

def preflight(args, out, progress=None, numeric=None):
    hashes, raw = {}, {}
    snapshot = out / 'inputs'
    snapshot.mkdir()
    for key in ('deck', 'brand', 'layout', 'validation'):
        path = Path(getattr(args, key))
        if key == 'layout':
            layout_checked = read_native_manifest_file(path)
            raw[key] = layout_checked['raw']
        else:
            raw[key] = path.read_bytes()
        path = path.resolve()
        hashes[key] = {'path': str(path), 'sha256': digest(raw[key]), 'byteCount': len(raw[key])}
        if progress is not None:
            progress['inputs'] = hashes
        (snapshot / ('deck.pptx' if key == 'deck' else key+'.json')).write_bytes(raw[key])
    brand, validation = [json.loads(raw[k]) for k in ('brand', 'validation')]
    layout = layout_checked['manifest']
    family = brand['font']['family']
    require(hashes['brand']['sha256'] == layout['inputHashes']['brand'], 'brand-hash', 'Brand bytes differ from layout approval')
    require(family == layout['fontFamily'], 'family-contract', 'Brand and layout family differ')
    require(validation['schemaVersion'] == 'presentation-finalization.v1', 'validation-schema', 'Unsupported finalization receipt')
    require(validation['finalSha256'] == hashes['deck']['sha256'] and validation['byteCount'] == len(raw['deck']), 'final-deck-hash', 'Deck differs from finalized bytes')
    for key in ('packageIntegrity', 'presentationLayout'):
        require(validation[key]['exitCode'] == 0 and validation[key]['findingCount'] == 0, 'finalization-check', f'{key} did not pass')
    require(validation['fontSelection']['approvedFamilies'] == [family] and validation['fontSelection']['passed'] and validation['fontSelection']['performed'], 'finalization-font', 'Finalization font policy did not pass for brand')
    for key in ('nativeTableArithmetic', 'nativeChartTitles'):
        require(validation[key]['performed'] is True and validation[key]['passed'] is True, 'finalization-check', f'{key} did not pass')
    require(validation['nativeChartValidation']['passed'] is True, 'finalization-check', 'Native chart check did not pass')
    imp = validation['firstPartyImport']
    require(imp['performed'] and imp['passed'] and imp['sha256'] == hashes['deck']['sha256'] and imp['slideCount'] == len(layout['slides']), 'finalization-import', 'Finalized import evidence differs')
    pages = source_pages_numeric(Path(args.deck), layout, family, numeric) if numeric is not None else source_pages(raw['deck'], layout, family)
    if progress is not None:
        progress['sourceContractPassed'] = True
    fontdir = out / 'fonts'
    fontdir.mkdir()
    cache = out / 'font-cache'
    cache.mkdir()
    config = out / 'fonts.conf'
    config.write_text('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>'+escape(str(fontdir))+'</dir><cachedir>'+escape(str(cache))+'</cachedir></fontconfig>')
    os.environ['FONTCONFIG_FILE'] = str(config)
    os.environ['XDG_CACHE_HOME'] = str(cache)
    fonts, faces = {}, []
    expected = layout['inputHashes']['fonts']
    paths = [(Path(args.brand).resolve().parent / f).resolve() for f in brand['font']['files']]
    require(len(paths) == len(set(paths)) and set(map(str, paths)) == set(expected), 'font-file-set', 'Approved resource paths differ from layout')
    for index, file in enumerate(paths):
        require(file.is_file(), 'missing-font-resource', f'Missing approved resource {file}; expected sha256 {expected[str(file)]}')
        content = file.read_bytes()
        require(digest(content) == expected[str(file)], 'font-hash', f'Changed font bytes {file}; expected {expected[str(file)]}')
        copy = fontdir / f'{index}{file.suffix}'
        copy.write_bytes(content)
        fonts[str(file)] = {'sha256': digest(content), 'snapshot': str(copy)}
        scanned = scan_faces(args.fc_scan, copy)
        require(any(family in f['families'] for f in scanned), 'font-family-metadata', f'{file} internal families do not contain {family}')
        faces.extend(f for f in scanned if family in f['families'])
    subprocess.run([str(Path(args.fc_match).with_name("fc-cache")), "-f", str(fontdir)], check=True, capture_output=True)
    selected = {}
    for style in {r['style'] for p in pages for r in p['runs']}:
        weight = 200 if style == 'bold' else 80
        fmt = '%{file}\x1f%{index}\x1f%{postscriptname}\x1f%{weight}'
        match = subprocess.run([args.fc_match, '--format', fmt, f'{family}:weight={weight}:slant=0'], check=True, capture_output=True, text=True).stdout.split('\x1f')
        matches = [f for f in faces if Path(f['file']).resolve() == Path(match[0]).resolve() and f['index'] == int(match[1])]
        require(len(matches) == 1, 'font-selection', f'Cannot establish real selected face for {style}: {match}')
        face = matches[0]
        require(face['slant'] == 0, 'unsupported-font-style', f'No real upright {style} face: {face}')
        require((face['weight'] >= 180 if style == 'bold' else face['weight'] <= 100), 'unsupported-font-style', f'No real {style} face: {face}')
        require(len(face['postscript']) == 1, 'font-metadata', f'Ambiguous PostScript identity: {face}')
        ranges = [tuple(int(part, 16) for part in item.split('-')) for item in face['charset'].split()]
        required_chars = set(transport(''.join(r['text'] for page in pages for r in page['runs'] if r['style'] == style)))
        missing = sorted(c for c in required_chars if not any(start <= ord(c) <= (parts[0] if parts else start) for start, *parts in ranges))
        require(not missing, 'font-glyph-coverage', f'{style} face {face["postscript"]} lacks required glyphs: {missing}')
        selected[style] = face
    if progress is not None:
        progress['fontResourcesPassed'] = True
    result = {'inputs': hashes, 'fonts': fonts, 'family': family, 'faces': faces, 'selected': selected, 'pages': pages}
    if numeric is not None:
        result['schemaVersion'] = 'native-font-expectation.v3'
        result['chartProgramHash'] = numeric['manifest']['programHash']
        result['contentContract'] = layout['semanticContent']['source']['contentContract']
    if layout_checked['transportVersion']:
        result.update(layoutTransport=layout_checked['transport'], layoutOriginal=layout_checked['original'])
    return result

class ActiveText(PDFPageAggregator):
    def __init__(self, manager):
        super().__init__(manager)
        self.spans, self.issues = [], []
        self.render_mode = 0
        self.page_number = 0
        self.state = {'ca': 1, 'fontUnresolved': False}

    def render_string(self, textstate, seq, ncs, graphicstate):
        self.render_mode = textstate.render
        if self.render_mode != 0:
            self.issues.append({'code': 'unsupported-text-render-mode', 'page': self.page_number, 'renderMode': self.render_mode})
        if self.state['fontUnresolved']:
            self.issues.append({'code': 'unresolved-active-font-state', 'page': self.page_number})
        if self.state['ca'] == 0:
            self.issues.append({'code': 'hidden-text-alpha', 'page': self.page_number})
        return super().render_string(textstate, seq, ncs, graphicstate)

    def render_char(self, matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate):
        before = len(self.cur_item._objs)
        advance = super().render_char(matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate)
        char = self.cur_item._objs[before]
        self.spans.append({'text': char.get_text(), 'font': str(font.fontname),
                           'face': canonical(str(font.fontname)), 'bbox': list(char.bbox),
                           'renderMode': self.render_mode, 'fontSize': fontsize})
        return advance

class ActiveInterpreter(PDFPageInterpreter):
    def init_state(self, ctm):
        super().init_state(ctm)
        if hasattr(self, 'inherited_graphicstate'):
            self.graphicstate = self.inherited_graphicstate.copy()
            self.textstate = self.inherited_textstate.copy()
        self.active_state = dict(getattr(self, 'inherited_active_state', {'ca': 1, 'fontUnresolved': False}))
        self.state_stack = []

    def dup(self):
        other = super().dup()
        other.inherited_active_state = dict(self.active_state)
        other.inherited_graphicstate = self.graphicstate.copy()
        other.inherited_textstate = self.textstate.copy()
        return other

    def do_q(self):
        self.state_stack.append(dict(self.active_state))
        super().do_q()

    def do_Q(self):
        if self.state_stack:
            self.active_state = self.state_stack.pop()
        super().do_Q()

    def do_TJ(self, seq):
        self.device.state = dict(self.active_state)
        return super().do_TJ(seq)

    def do_gs(self, name):
        state = dict_value(dict_value(self.resources.get('ExtGState', {})).get(literal_name(name), {}))
        if 'ca' in state:
            self.active_state['ca'] = state['ca']
        if 'Font' in state:
            self.active_state['fontUnresolved'] = True

    def do_Tf(self, fontid, fontsize):
        super().do_Tf(fontid, fontsize)
        self.active_state['fontUnresolved'] = False

def inspect_pdf(pdf, expectation):
    manager = PDFResourceManager()
    device = ActiveText(manager)
    interpreter = ActiveInterpreter(manager, device)
    evidence, issues = [], []
    with open(pdf, 'rb') as stream:
        pages = list(PDFPage.get_pages(stream))
        require(len(pages) == len(expectation['pages']), 'pdf-page-count', 'Converted PDF page count differs from source')
        for index, (page, source) in enumerate(zip(pages, expectation['pages']), 1):
            device.spans, device.issues, device.page_number = [], [], index
            interpreter.process_page(page)
            spans = device.spans
            text = ''.join(s['text'] for s in spans if s['renderMode'] == 0)
            required = ''.join(r['text'] for r in source['runs'])
            if transport(text) != transport(required):
                issues.append({'code': 'pdf-required-text', 'page': index, 'expected': required, 'actual': text})
            expected_faces, actual_faces = defaultdict(Counter), defaultdict(Counter)
            for run in source['runs']:
                expected_faces[expectation['selected'][run['style']]['postscript'][0]].update(transport(run['text']))
            for span in spans:
                if transport(span['text']):
                    actual_faces[span['face']].update(transport(span['text']))
                if span['face'] not in expected_faces and transport(span['text']):
                    issues.append({'code': 'substituted-active-face', 'page': index, 'face': span['face'], 'text': span['text']})
                if span['fontSize'] <= 0 or span['bbox'][0] == span['bbox'][2] and transport(span['text']):
                    issues.append({'code': 'unsupported-text-render-mode', 'page': index, 'text': span['text']})
            expected_sequence = [(c, expectation['selected'][r['style']]['postscript'][0]) for r in source['runs'] for c in transport(r['text'])]
            actual_sequence = [(c, s['face']) for s in spans for c in transport(s['text'])]
            if expected_sequence != actual_sequence:
                issues.append({'code': 'pdf-style-attribution', 'page': index, 'detail': 'Character-to-face sequence differs from source styles'})
            for face in set(expected_faces) | set(actual_faces):
                expected_count, actual_count = expected_faces.get(face, Counter()), actual_faces.get(face, Counter())
                if expected_count != actual_count:
                    issues.append({'code': 'pdf-style-attribution', 'page': index, 'face': face, 'missing': dict(expected_count-actual_count), 'extra': dict(actual_count-expected_count)})
            missing = cjk(required) - cjk(text)
            replacement = text.count('\ufffd') + text.count('\u25a1')
            if missing or replacement:
                issues.append({'code': 'pdf-cjk-coverage', 'page': index, 'missingCjk': dict(missing), 'replacementGlyphs': replacement})
            issues.extend(device.issues)
            evidence.append({'page': index, 'text': text, 'sourceCjkCount': sum(cjk(required).values()), 'pdfCjkCount': sum(cjk(text).values()), 'missingCjk': dict(missing), 'replacementGlyphs': replacement, 'activeFaces': {k: dict(v) for k,v in actual_faces.items()}, 'spans': spans})
    return {'pages': evidence, 'issues': issues}

def formatted_value(value, number_format):
    require(re.fullmatch(r'0(?:\.0{1,3})?%?', number_format) is not None, 'numeric-format', number_format)
    places = len(number_format.rstrip('%').partition('.')[2])
    number = Decimal(value) * (100 if number_format.endswith('%') else 1)
    require(number.is_finite(), 'numeric-value', value)
    rounded = number.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    return format(rounded, f'.{places}f') + ('%' if number_format.endswith('%') else '')


def source_pages_numeric(deck, layout, family, chart_evidence):
    spec = importlib.util.spec_from_file_location('native_object_coverage', Path(__file__).with_name('object-coverage.py'))
    coverage_owner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(coverage_owner)
    coverage = coverage_owner.inspect_numeric(deck, layout, chart_evidence)
    objects = {row['elementId']: row for row in coverage['objects']}
    pages = source_pages(deck.read_bytes(), layout, family, objects)
    charts = {row['elementId']: row for row in chart_evidence['program']['occurrences']}
    for page, planned in zip(pages, layout['slides']):
        page['sizePoints'] = [layout['width']*.75, layout['height']*.75]
        page['regions'] = []
        for element in planned['elements']:
            if element['type'] not in ('text', 'chart'):
                continue
            obj = objects[element['id']]
            x, y, w, h = [n*.75 for n in obj['geometry']]
            region = {'elementId': element['id'], 'occurrenceId': element['occurrenceId'],
                      'kind': element['type'], 'bbox': [x, page['sizePoints'][1]-y-h, x+w, page['sizePoints'][1]-y]}
            if element['type'] == 'text':
                region.update({'text': obj['text'], 'sourceTextSha256': obj['sourceTextSha256'],
                               'style': 'bold' if element.get('bold') else 'regular', 'sizePoints': element['size']*.75})
                if 'metadataDisplay' in obj:
                    region['metadataDisplay'] = obj['metadataDisplay']
                    region['kind'] = 'metadata'
                page['regions'].append(region)
                continue
            row = charts[element['id']]
            chart, brand = row['expectedChart'], row['brand']
            labels = [{'role': 'title', 'text': chart['title'], 'sizePoints': brand['titleSize']*.75},
                      {'role': 'unit', 'text': chart['unit'], 'sizePoints': brand['axisSize']*.75}]
            labels.extend({'role': 'category', 'category': i, 'text': c['label'], 'sizePoints': brand['axisSize']*.75}
                          for i, c in enumerate(chart['categories']))
            for si, series in enumerate(chart['series']):
                labels.append({'role': 'legend', 'series': si, 'text': series['name'], 'sizePoints': brand['legendSize']*.75})
                labels.extend({'role': 'data', 'series': si, 'category': ci, 'text': formatted_value(value, chart['numberFormat']),
                               'sizePoints': brand['labelSize']*.75} for ci, value in enumerate(series['decimals']))
            for label in labels:
                label['style'] = 'regular'
            region.update({'identity': row['identity'], 'authoredOccurrenceId': row['authoredOccurrenceId'],
                           'labels': labels, 'numberFormat': chart['numberFormat'], 'axisSizePoints': brand['axisSize']*.75,
                           'direction': chart.get('direction', 'column'), 'chartType': chart['type']})
            page['regions'].append(region)
            page['runs'].extend({'shape': element['id'], 'text': l['text'], 'style': l['style']} for l in labels)
    return pages


def embedded_glyph_metrics(font):
    resource = font.descriptor.get('FontFile2')
    if resource is None:
        return None
    require(font.flags & 4 and not font.is_multibyte(), 'pdf-embedded-metrics-unsupported', str(font.fontname))
    data = stream_value(resource).get_data()
    parsed = TrueTypeFont(str(font.fontname), io.BytesIO(data))
    tables = parsed.tables
    require(all(key in tables for key in (b'head', b'cmap', b'loca', b'glyf', b'maxp')), 'pdf-embedded-metrics-unsupported', str(font.fontname))
    head = tables[b'head'][0]
    units = struct.unpack_from('>H', data, head+18)[0]
    loca_format = struct.unpack_from('>h', data, head+50)[0]
    require(units > 0 and loca_format in (0,1), 'pdf-embedded-metrics-unsupported', str(font.fontname))
    cmap = tables[b'cmap'][0]
    count = struct.unpack_from('>H',data,cmap+2)[0]
    maps = []
    for index in range(count):
        platform, encoding, offset = struct.unpack_from('>HHI',data,cmap+4+index*8)
        pos = cmap+offset
        if (platform,encoding)==(1,0) and struct.unpack_from('>H',data,pos)[0]==0:
            require(struct.unpack_from('>H',data,pos+2)[0]==262, 'pdf-embedded-metrics-unsupported', str(font.fontname))
            maps.append(data[pos+6:pos+262])
    require(len(maps)==1, 'pdf-embedded-metrics-unsupported', str(font.fontname))
    glyph_count = struct.unpack_from('>H',data,tables[b'maxp'][0]+4)[0]
    loca = tables[b'loca'][0]
    fmt, step, factor = ('>H',2,2) if loca_format==0 else ('>I',4,1)
    offsets = [struct.unpack_from(fmt,data,loca+i*step)[0]*factor for i in range(glyph_count+1)]
    bounds = []
    for gid in maps[0]:
        require(gid<glyph_count, 'pdf-embedded-metrics-unsupported', str(font.fontname))
        if offsets[gid]==offsets[gid+1]:
            bounds.append(None)
        else:
            require(offsets[gid]<offsets[gid+1]<=tables[b'glyf'][1], 'pdf-embedded-metrics-unsupported', str(font.fontname))
            bounds.append(list(struct.unpack_from('>hhhh',data,tables[b'glyf'][0]+offsets[gid]+2)))
    return {'units':units,'bounds':bounds,'fontSha256':digest(data),'mapping':'symbolic-macintosh-format0'}


class RegionalText(ActiveText):
    def __init__(self, manager):
        super().__init__(manager)
        self.metric_cache = {}

    def render_char(self, matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate):
        advance = super().render_char(matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate)
        span = self.spans[-1]
        key = id(font)
        if key not in self.metric_cache:
            try:
                self.metric_cache[key] = embedded_glyph_metrics(font)
            except (Refusal, ValueError, struct.error, KeyError, IndexError) as error:
                self.metric_cache[key] = {'error':str(error)}
        metrics = self.metric_cache[key]
        if metrics and 'error' in metrics:
            self.issues.append({'code':'pdf-embedded-metrics-unsupported','page':self.page_number,'detail':metrics['error']})
        elif metrics:
            require(0 <= cid < len(metrics['bounds']), 'pdf-embedded-metrics-unsupported', str(cid))
            bounds = metrics['bounds'][cid]
            span.update({'advanceBbox':span['bbox'],'embeddedFontSha256':metrics['fontSha256'],'glyphMapping':metrics['mapping'],'cid':cid,'hasInk':bounds is not None})
            a,b,c,d,e,f = matrix
            if bounds is None:
                points = [(e+c*rise,f+d*rise),(e+a*advance+c*rise,f+b*advance+d*rise)]
            else:
                x0,y0,x1,y1 = bounds
                points = [(a*x*fontsize*scaling/metrics['units']+c*(y*fontsize/metrics['units']+rise)+e,
                           b*x*fontsize*scaling/metrics['units']+d*(y*fontsize/metrics['units']+rise)+f)
                          for x,y in ((x0,y0),(x0,y1),(x1,y0),(x1,y1))]
            span['inkBbox'] = [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]
        self.spans[-1].update({'glyphIndex': len(self.spans)-1, 'matrix': list(matrix),
                               'effectiveSize': abs(fontsize)*math.hypot(matrix[2], matrix[3]),
                               'advance': advance, 'alpha': self.state['ca'], 'clip': self.state.get('clip'),
                               'unsupportedClip': self.state.get('unsupportedClip', False)})
        return advance


class RegionalInterpreter(ActiveInterpreter):
    def do_Do(self, xobjid):
        resource = self.xobjmap.get(literal_name(xobjid))
        if resource is None:
            return super().do_Do(xobjid)
        form = stream_value(resource)
        if literal_name(form.get('Subtype')) != 'Form':
            return super().do_Do(xobjid)
        prior = dict(self.active_state)
        box = form.get('BBox')
        if not isinstance(box,(list,tuple)) or len(box)!=4:
            self.active_state['unsupportedClip'] = True
        else:
            a,b,c,d,e,f = mult_matrix(form.get('Matrix',(1,0,0,1,0,0)),self.ctm)
            x0,y0,x1,y1 = box
            points = [(a*x+c*y+e,b*x+d*y+f) for x,y in ((x0,y0),(x0,y1),(x1,y0),(x1,y1))]
            if len({round(x,6) for x,y in points})!=2 or len({round(y,6) for x,y in points})!=2:
                self.active_state['unsupportedClip'] = True
            else:
                clip = [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]
                existing = self.active_state.get('clip')
                self.active_state['clip'] = [max(existing[0],clip[0]),max(existing[1],clip[1]),min(existing[2],clip[2]),min(existing[3],clip[3])] if existing else clip
        try:
            return super().do_Do(xobjid)
        finally:
            self.active_state = prior

    def do_W(self):
        path = self.curpath
        rectangle = len(path) == 5 and [p[0] for p in path] == ['m','l','l','l','h']
        if rectangle:
            a,b,c,d,e,f = self.ctm
            points = [(a*p[1]+c*p[2]+e,b*p[1]+d*p[2]+f) for p in path[:4]]
            rectangle = len({round(x,6) for x,y in points}) == 2 and len({round(y,6) for x,y in points}) == 2
        if not rectangle:
            self.active_state['unsupportedClip'] = True
        else:
            box = [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]
            prior = self.active_state.get('clip')
            self.active_state['clip'] = [max(prior[0],box[0]),max(prior[1],box[1]),min(prior[2],box[2]),min(prior[3],box[3])] if prior else box

    def do_W_a(self):
        self.do_W()


def contained(inner, outer, tolerance=.5):
    return all(math.isfinite(v) for v in inner) and inner[0] >= outer[0]-tolerance and inner[1] >= outer[1]-tolerance and inner[2] <= outer[2]+tolerance and inner[3] <= outer[3]+tolerance


def union_box(glyphs):
    return [min(g['bbox'][0] for g in glyphs), min(g['bbox'][1] for g in glyphs),
            max(g['bbox'][2] for g in glyphs), max(g['bbox'][3] for g in glyphs)]


def text_lines(glyphs):
    groups = []
    for glyph in glyphs:
        a, b, c, d, x, y = glyph['matrix']
        length = math.hypot(a, b)
        require(length > 0, 'pdf-text-orientation', str(glyph['glyphIndex']))
        ux, uy = a/length, b/length
        require(abs(ux) < .001 or abs(uy) < .001, 'pdf-text-orientation', str(glyph['glyphIndex']))
        baseline, along = -uy*x+ux*y, ux*x+uy*y
        found = next((g for g in groups if abs(g['ux']-ux)<.001 and abs(g['uy']-uy)<.001 and abs(g['baseline']-baseline)<.25), None)
        if found is None:
            found = {'ux': ux, 'uy': uy, 'baseline': baseline, 'glyphs': []}
            groups.append(found)
        found['glyphs'].append((along, glyph))
    result = []
    for group in groups:
        ordered = [g for _,g in sorted(group['glyphs'], key=lambda pair: pair[0])]
        chunks = [[]]
        for glyph in ordered:
            if chunks[-1]:
                prev = chunks[-1][-1]
                delta = group['ux']*(glyph['matrix'][4]-prev['matrix'][4])+group['uy']*(glyph['matrix'][5]-prev['matrix'][5])
                if delta-abs(prev['advance']) > max(prev['effectiveSize'], glyph['effectiveSize']):
                    chunks.append([])
            chunks[-1].append(glyph)
        for chunk in chunks:
            result.append({'text': ''.join(g['text'] for g in chunk), 'glyphs': chunk, 'bbox': union_box(chunk),
                           'baseline': group['baseline'], 'ux': group['ux'], 'uy': group['uy']})
    return sorted(result, key=lambda line: (-line['bbox'][3],line['bbox'][0]))


def chart_text_lines(lines, labels):
    available = set(range(len(lines)))
    combined = []
    for text in dict.fromkeys(label['text'] for label in labels if '\n' in label['text']):
        parts = text.split('\n')
        if not all(parts):
            continue
        for first in list(sorted(available)):
            if lines[first]['text'] != parts[0] or abs(lines[first]['uy']) > .001:
                continue
            group = [first]
            for part in parts[1:]:
                previous = lines[group[-1]]
                def aligned(index):
                    candidate = lines[index]
                    a,b = previous['bbox'],candidate['bbox']
                    return abs(candidate['uy'])<.001 and (abs(a[0]-b[0])<=.5 or abs(a[0]+a[2]-b[0]-b[2])<=1) and previous['baseline']-candidate['baseline']>=min(g['effectiveSize'] for g in candidate['glyphs'])-.25
                candidates = [i for i in available if i not in group and lines[i]['text']==part and aligned(i)]
                if len(candidates)!=1:
                    break
                group.append(candidates[0])
            if len(group)!=len(parts):
                continue
            glyphs = [glyph for index in group for glyph in lines[index]['glyphs']]
            combined.append({'text':text,'glyphs':glyphs,'bbox':union_box(glyphs),'baseline':min(lines[i]['baseline'] for i in group),'ux':1,'uy':0})
            available.difference_update(group)
    return sorted([lines[i] for i in available]+combined,key=lambda line:(-line['bbox'][3],line['bbox'][0]))


def check_label_glyphs(line, label, selected, issues, context):
    face = selected[label['style']]['postscript'][0]
    for glyph in line['glyphs']:
        if glyph['face'] != face:
            issues.append({'code': 'substituted-active-face', **context, 'glyph': glyph['glyphIndex'], 'actual': glyph['face'], 'expected': face})
        if abs(glyph['effectiveSize']-label['sizePoints']) > .25:
            issues.append({'code': 'pdf-font-size', **context, 'glyph': glyph['glyphIndex'], 'actual': glyph['effectiveSize'], 'expected': label['sizePoints']})


def chart_position_bindings(region, lines, unused, context):
    categories = sorted((label for label in region['labels'] if label['role'] == 'category'), key=lambda label: label['category'])
    legends = sorted((label for label in region['labels'] if label['role'] == 'legend'), key=lambda label: label['series'])
    data = {(label['category'], label['series']): label for label in region['labels'] if label['role'] == 'data'}
    keys = {(ci, si) for ci in range(len(categories)) for si in range(len(legends))}
    valid = categories and legends and [label['category'] for label in categories] == list(range(len(categories)))
    valid = valid and [label['series'] for label in legends] == list(range(len(legends))) and set(data) == keys
    valid = valid and len(data) == sum(label['role'] == 'data' for label in region['labels'])
    if not valid or region.get('chartType', 'bar') not in ('bar', 'line') or region['direction'] not in ('column', 'bar'):
        return [], [{'code': 'pdf-chart-association-unavailable', **context, 'detail': 'Unsupported category/series grid or orientation'}]
    if region.get('chartType') == 'line' and (len(legends) != 1 or region['direction'] != 'column'):
        return [], [{'code': 'pdf-chart-association-unavailable', **context, 'detail': 'Line series need independent path association'}]
    vertical = region['direction'] != 'bar'
    axis = 0 if vertical else 1
    def position(index):
        box = lines[index]['bbox']
        return (box[axis]+box[axis+2])/2
    category_text = {label['text'] for label in categories}
    anchors = sorted((i for i in unused if lines[i]['text'] in category_text and abs(lines[i]['uy']) < .001), key=position)
    if len(anchors) != len(categories):
        return [], [{'code': 'pdf-required-chart-label', **context, 'role': 'category', 'candidateCount': len(anchors), 'expectedCount': len(categories)}]
    positions = [position(i) for i in anchors]
    if any(b-a <= .5 for a,b in zip(positions, positions[1:])):
        return [], [{'code': 'pdf-chart-association-unavailable', **context, 'detail': 'Category positions are ambiguous'}]
    bindings = list(zip(categories, anchors))
    category_boxes = [lines[i]['bbox'] for i in anchors]
    data_text = {label['text'] for label in data.values()}
    candidates = [i for i in unused if i not in anchors and lines[i]['text'] in data_text and abs(lines[i]['uy']) < .001]
    if vertical:
        candidates = [i for i in candidates if lines[i]['bbox'][2] > min(box[0] for box in category_boxes)]
    else:
        candidates = [i for i in candidates if lines[i]['bbox'][1] >= min(box[1] for box in category_boxes)-.5]
    boundaries = [(a+b)/2 for a,b in zip(positions, positions[1:])]
    groups = [[] for _ in categories]
    issues = []
    if vertical:
        remaining = set(unused)
        for index in anchors:
            bottom = min(lines[i]['baseline'] for i in remaining if abs(lines[i]['uy']) < .001)
            if abs(lines[index]['baseline']-bottom) >= .25:
                issues.append({'code': 'pdf-required-chart-label', **context, 'role': 'category', 'detail': 'Category label is not on the bottom category axis'})
            remaining.remove(index)
    for index in candidates:
        coordinate = position(index)
        if any(abs(coordinate-boundary) <= .5 for boundary in boundaries):
            issues.append({'code': 'pdf-chart-association-unavailable', **context, 'detail': 'Data label lies on a category boundary', 'bbox': lines[index]['bbox']})
            continue
        if len(positions)>1 and (coordinate < positions[0]-(positions[1]-positions[0])/2 or coordinate > positions[-1]+(positions[-1]-positions[-2])/2):
            issues.append({'code': 'pdf-chart-association-unavailable', **context, 'detail': 'Data label lies outside category cells', 'bbox': lines[index]['bbox']})
            continue
        groups[sum(coordinate>boundary for boundary in boundaries)].append(index)
    for ci, group in enumerate(groups):
        group.sort(key=position)
        if len(group) != len(legends):
            issues.append({'code': 'pdf-required-chart-label', **context, 'role': 'data', 'category': ci, 'candidateCount': len(group), 'expectedCount': len(legends)})
            continue
        if any(position(b)-position(a) <= .5 for a,b in zip(group,group[1:])):
            issues.append({'code': 'pdf-chart-association-unavailable', **context, 'category': ci, 'detail': 'Series positions are ambiguous'})
            continue
        bindings.extend((data[ci,si], index) for si,index in enumerate(group))
    for label,index in bindings:
        if label['text'] != lines[index]['text']:
            issues.append({'code': 'pdf-chart-label-association', **context, 'label': label, 'actual': lines[index]['text'], 'bbox': lines[index]['bbox']})
    return bindings, issues


def inspect_region(region, glyphs, selected, page):
    context = {'page': page, 'elementId': region['elementId']}
    issues, assignments = [], []
    lines = text_lines(glyphs)
    if region['kind'] != 'chart':
        expected = [(i, text) for i,text in enumerate(region['text'].split('\n')) if text]
        if [line['text'] for line in lines] != [text for _,text in expected]:
            issues.append({'code': 'pdf-required-region-text', **context, 'expected': region['text'], 'actualLines': [l['text'] for l in lines]})
        for index, line in enumerate(lines):
            check_label_glyphs(line, region, selected, issues, context)
            assignments.append({'role': region['kind'], 'line': index, 'text': line['text'], 'bbox': line['bbox'], 'glyphs': [g['glyphIndex'] for g in line['glyphs']]})
        if len(expected) == len(lines) and len(lines) > 1:
            normalized = [(lines[i-1]['baseline']-lines[i]['baseline'])/(expected[i][0]-expected[i-1][0]) for i in range(1,len(lines))]
            if min(normalized) < region['sizePoints']-.25 or max(normalized)-min(normalized) > .5:
                issues.append({'code': 'pdf-paragraph-spacing', **context, 'lineSteps': normalized})
        for first,second in zip(lines,lines[1:]):
            a,b=first['bbox'],second['bbox']
            if min(a[2],b[2])-max(a[0],b[0])>.5 and min(a[3],b[3])-max(a[1],b[1])>.5:
                issues.append({'code':'pdf-label-overlap',**context})
        return {'assignments': assignments, 'issues': issues}
    lines = chart_text_lines(lines,region['labels'])
    unused = list(range(len(lines)))
    labels = sorted((label for label in region['labels'] if label['role'] in ('title','unit','legend')), key=lambda label: ['title','unit','legend'].index(label['role']))
    for label in labels:
        candidates = [i for i in unused if lines[i]['text'] == label['text']]
        role = label['role']
        horizontal = [i for i in unused if abs(lines[i]['uy']) < .001]
        if role == 'title' and horizontal:
            top = max(lines[i]['baseline'] for i in horizontal)
            candidates = [i for i in candidates if abs(lines[i]['baseline']-top)<.25]
        elif role == 'legend' and horizontal:
            bottom = min(lines[i]['baseline'] for i in horizontal)
            candidates = [i for i in candidates if abs(lines[i]['baseline']-bottom)<.25]
        elif role == 'unit':
            candidates = [i for i in candidates if abs(lines[i]['uy']) < .001] if region['direction']=='bar' else [i for i in candidates if abs(lines[i]['uy']) > .99]
        if len(candidates) > 1:
            remaining = [l for l in labels if l['role'] == role and l['text'] == label['text']]
            used = sum(a['role'] == role and a['text'] == label['text'] for a in assignments)
            if len(candidates) == len(remaining)-used:
                candidates = [sorted(candidates, key=lambda i:(lines[i]['bbox'][0],-lines[i]['bbox'][3]))[0]]
        if len(candidates) != 1:
            issues.append({'code': 'pdf-required-chart-label', **context, 'label': label, 'candidateCount': len(candidates)})
            continue
        index = candidates[0]
        unused.remove(index)
        line = lines[index]
        check_label_glyphs(line, label, selected, issues, context)
        assignments.append({**label, 'bbox': line['bbox'], 'glyphs': [g['glyphIndex'] for g in line['glyphs']]})
    legends = sorted((a for a in assignments if a['role'] == 'legend'), key=lambda a: a['bbox'][0])
    if [a['series'] for a in legends] != list(range(sum(label['role'] == 'legend' for label in labels))):
        issues.append({'code': 'pdf-chart-label-association', **context, 'role': 'legend', 'detail': 'Legend series order differs from source'})
    bindings, association_issues = chart_position_bindings(region, lines, unused, context)
    issues.extend(association_issues)
    for label,index in bindings:
        unused.remove(index)
        line = lines[index]
        check_label_glyphs(line, label, selected, issues, context)
        assignments.append({**label, 'bbox': line['bbox'], 'glyphs': [g['glyphIndex'] for g in line['glyphs']]})
    ticks = [lines[i] for i in unused]
    pattern = r'-?\d+' + (r'\.\d{'+str(len(region['numberFormat'].rstrip('%').partition('.')[2]))+'}' if '.' in region['numberFormat'] else '') + ('%' if region['numberFormat'].endswith('%') else '')
    vertical = region['direction'] != 'bar'
    if ticks:
        axes = [t['bbox'][2] if vertical else t['baseline'] for t in ticks]
        valid = len(ticks)>=2 and max(axes)-min(axes) <= .5 and all(re.fullmatch(pattern,t['text']) for t in ticks)
        category_boxes = [a['bbox'] for a in assignments if a['role'] == 'category']
        valid = valid and bool(category_boxes) and all(t['bbox'][2] < min(b[0] for b in category_boxes) if vertical else t['bbox'][3] < min(b[1] for b in category_boxes) for t in ticks)
        if not valid:
            issues.append({'code': 'pdf-unassigned-chart-text', **context, 'lines': [{'text':t['text'],'bbox':t['bbox']} for t in ticks]})
        else:
            ordered = sorted(ticks, key=lambda t:t['baseline'] if vertical else t['bbox'][0])
            values = [Decimal(t['text'].rstrip('%')) for t in ordered]
            if any(a>=b for a,b in zip(values,values[1:])):
                issues.append({'code': 'pdf-axis-text-order', **context})
            for tick in ordered:
                check_label_glyphs(tick, {'style':'regular','sizePoints':region['axisSizePoints']},selected,issues,context)
                assignments.append({'role':'observed-tick','text':tick['text'],'bbox':tick['bbox'],'glyphs':[g['glyphIndex'] for g in tick['glyphs']]})
    else:
        issues.append({'code': 'pdf-axis-text-missing', **context})
    for i, first in enumerate(assignments):
        for second in assignments[i+1:]:
            a,b=first['bbox'],second['bbox']
            if min(a[2],b[2])-max(a[0],b[0]) > .5 and min(a[3],b[3])-max(a[1],b[1]) > .5:
                issues.append({'code':'pdf-label-overlap',**context,'roles':[first['role'],second['role']]})
    return {'assignments':assignments,'issues':issues}


def inspect_pdf_numeric(pdf, expectation):
    manager = PDFResourceManager()
    device = RegionalText(manager)
    interpreter = RegionalInterpreter(manager, device)
    evidence, issues = [], []
    with open(pdf, 'rb') as stream:
        pages = list(PDFPage.get_pages(stream))
        require(len(pages) == len(expectation['pages']), 'pdf-page-count', 'Converted PDF page count differs from source')
        for index, (page, source) in enumerate(zip(pages, expectation['pages']), 1):
            width,height = source['sizePoints']
            require(page.rotate == 0 and list(page.mediabox) == list(page.cropbox) and all(abs(a-b)<.25 for a,b in zip(page.mediabox,[0,0,width,height])), 'pdf-page-geometry', str(index))
            device.spans,device.issues,device.page_number=[],[],index
            interpreter.process_page(page)
            assigned = {r['elementId']: [] for r in source['regions']}
            approved_faces = {face['postscript'][0] for face in expectation['selected'].values()}
            for glyph in device.spans:
                if not glyph['text']:
                    continue
                if glyph['face'] not in approved_faces:
                    issues.append({'code':'unapproved-active-face','page':index,'glyph':glyph['glyphIndex'],'actual':glyph['face'],'approved':sorted(approved_faces)})
                owners = [r for r in source['regions'] if contained(glyph.get('inkBbox',glyph['bbox']),r['bbox'])]
                if len(owners) != 1:
                    issues.append({'code':'pdf-region-ownership','page':index,'glyph':glyph['glyphIndex'],'text':glyph['text'],'owners':[r['elementId'] for r in owners]})
                else:
                    assigned[owners[0]['elementId']].append(glyph)
                if glyph.get('unsupportedClip') or glyph.get('clip') is not None and not contained(glyph.get('inkBbox',glyph['bbox']),glyph['clip']):
                    issues.append({'code':'pdf-glyph-clipping','page':index,'glyph':glyph['glyphIndex']})
                if glyph['renderMode'] != 0 or glyph['alpha'] != 1 or glyph['effectiveSize'] <= 0 or glyph['bbox'][0] == glyph['bbox'][2] or '\ufffd' in glyph['text'] or '\u25a1' in glyph['text']:
                    issues.append({'code':'pdf-glyph-visibility','page':index,'glyph':glyph['glyphIndex']})
            regions=[]
            for region in source['regions']:
                result=inspect_region(region,assigned[region['elementId']],expectation['selected'],index)
                issues.extend(result['issues'])
                regions.append({'elementId':region['elementId'],'assignments':result['assignments']})
            for ri,first in enumerate(regions):
                for second in regions[ri+1:]:
                    for a in first['assignments']:
                        for b in second['assignments']:
                            x,y=a['bbox'],b['bbox']
                            if min(x[2],y[2])-max(x[0],y[0])>.5 and min(x[3],y[3])-max(x[1],y[1])>.5:
                                issues.append({'code':'pdf-label-overlap','page':index,'elements':[first['elementId'],second['elementId']]})
            issues.extend(device.issues)
            evidence.append({'page':index,'regions':regions,'spans':device.spans})
    return {'pages':evidence,'issues':issues}


def write_report(out, expectation=None, evidence=None, issues=None, progress=None):
    issues = (issues or []) + (evidence or {}).get('issues', [])
    text_codes = {'pdf-required-text', 'pdf-cjk-coverage', 'pdf-page-count'}
    font_codes = {'unapproved-active-face', 'substituted-active-face', 'pdf-style-attribution', 'unresolved-active-font-state'}
    report = {'schemaVersion': 'native-font-verification.v2',
              'sourceContractPassed': expectation is not None, 'fontResourcesPassed': expectation is not None,
              'textCheckPassed': evidence is not None and not any(i['code'] in text_codes for i in issues),
              'fontCheckPassed': evidence is not None and not any(i['code'] in font_codes for i in issues),
              'visibilityDiagnostics': {'status': 'unproven', 'sampledRenders': 0, 'claim': 'No automatic glyph visibility or legibility certification'},
              'visualInspection': {'status': 'pending'}, 'deliveryStatus': 'pending', 'passed': False,
              'issues': issues, 'expectation': expectation, 'evidence': evidence,
              'limitations': 'Current direct-run single-family writer. ASCII space/tab/CR/LF transport normalization. Exact independent all-page appearance review remains required. LibreOffice compatibility only; no Microsoft PowerPoint execution.'}
    if (expectation or {}).get('schemaVersion') == 'native-font-expectation.v3':
        report['schemaVersion'] = 'native-font-verification.v3'
        report['textCheckPassed'] = evidence is not None and not any(i['code'].startswith('pdf-required') for i in issues)
        report['fontCheckPassed'] = evidence is not None and not any(i['code'] in font_codes or i['code'] == 'pdf-font-size' for i in issues)
        report['regionCheckPassed'] = evidence is not None and not issues
        report['chartPathGeometryVerified'] = False
        report['limitations'] = 'Source-bound native chart/workbook evidence is separate. Regional PDF text, font and geometry checks do not certify chart paths, contrast, occlusion, visual quality or Microsoft Office editing. Independent all-page visual inspection remains required.'
    if (expectation or {}).get('layoutTransport'):
        report.update(semanticFontVersion=report['schemaVersion'], schemaVersion='native-font-verification.v4', layoutTransport=expectation['layoutTransport'], layoutOriginal=expectation['layoutOriginal'])
    for key in ('deck.pptx', 'deck.pdf'):
        p = out / ('inputs/deck.pptx' if key.endswith('pptx') else key)
        if p.is_file():
            report.setdefault('outputs', {})[key] = {'sha256': digest(p.read_bytes()), 'byteCount': p.stat().st_size}
    report['engineIdentity'] = {'pdfminer.six': importlib.metadata.version('pdfminer.six'), 'pypdf': importlib.metadata.version('pypdf')}
    if (out / 'engine-version.txt').exists():
        report['engineIdentity']['libreOffice'] = (out / 'engine-version.txt').read_text().strip()
    if progress:
        report.update(progress)
    report['checkedDeckSha256'] = (expectation or {}).get('inputs', {}).get('deck', {}).get('sha256')
    report['automationPassed'] = all(report[k] for k in ('sourceContractPassed', 'fontResourcesPassed', 'textCheckPassed', 'fontCheckPassed')) and not issues
    if not report['automationPassed']:
        report['deliveryStatus'] = 'blocked'
    (out / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    return report

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=('preflight', 'preflight-numeric', 'inspect'))
    parser.add_argument('--out', required=True)
    for key in ('deck', 'brand', 'layout', 'validation', 'fc-scan', 'fc-match'):
        parser.add_argument('--'+key)
    parser.add_argument('--conversion-exit', type=int)
    args = parser.parse_args()
    out = Path(args.out).resolve()
    expectation = None
    progress = {}
    try:
        if args.operation in ('preflight', 'preflight-numeric'):
            numeric = None
            if args.operation == 'preflight-numeric':
                progress.update(schemaVersion='native-font-verification.v3', regionCheckPassed=False, chartPathGeometryVerified=False)
                payload = sys.stdin.buffer.read(8*1024*1024+1)
                require(len(payload) <= 8*1024*1024, 'numeric-input-bound', 'Maximum 8 MiB')
                numeric = json.loads(payload)
            expectation = preflight(args, out, progress, numeric)
            (out / 'expectation.json').write_text(json.dumps(expectation, ensure_ascii=False, indent=2))
            return 0
        expectation = json.loads((out / 'expectation.json').read_text())
        require(args.conversion_exit == 0, 'conversion', f'Conversion failed with exit {args.conversion_exit}')
        pdf = out / 'deck.pdf'
        require(pdf.is_file() and pdf.stat().st_size > 0, 'conversion', 'Fresh conversion did not produce a PDF')
        evidence = inspect_pdf_numeric(pdf, expectation) if expectation.get('schemaVersion') == 'native-font-expectation.v3' else inspect_pdf(pdf, expectation)
        report = write_report(out, expectation, evidence)
        print(json.dumps({k: report[k] for k in ('automationPassed', 'deliveryStatus', 'textCheckPassed', 'fontCheckPassed')}))
        return 0 if report['automationPassed'] else 1
    except Exception as error:
        code = error.code if isinstance(error, Refusal) else 'verification-error'
        write_report(out, expectation, issues=[{'code': code, 'detail': str(error)}], progress=progress)
        print(f'{code}: {error}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
