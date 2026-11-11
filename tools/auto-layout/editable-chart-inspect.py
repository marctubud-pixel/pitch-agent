import hashlib, io, json, posixpath, re, sys, zipfile
from decimal import Decimal
from editable_chart_refs import worksheet as read_worksheet, formula_range
import xml.etree.ElementTree as E

z = zipfile.ZipFile(sys.argv[1])
document = json.load(open(sys.argv[2]))
ns = {'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'p': 'http://schemas.openxmlformats.org/presentationml/2006/main', 'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}

def target(package, part, rel_id, suffix):
    rels = E.fromstring(package.read(posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part) + '.rels')))
    matches = [r for r in rels if r.attrib['Id'] == rel_id]
    if not (len(matches) == 1): raise ValueError("Draft chart package mismatch at check 12")
    rel = matches[0]
    if not (rel.attrib['Type'].endswith('/' + suffix) and rel.attrib.get('TargetMode', 'Internal') == 'Internal'): raise ValueError("Draft chart package mismatch at check 14")
    return posixpath.normpath(rel.attrib['Target'].lstrip('/') if rel.attrib['Target'].startswith('/') else posixpath.join(posixpath.dirname(part), rel.attrib['Target']))

seen = []
for page_index, page in enumerate(document['plan']['slides']):
    slide_part = 'ppt/slides/slide%d.xml' % (page_index + 1)
    slide = E.fromstring(z.read(slide_part))
    elements = [e for e in page['elements'] if e['type'] == 'chart']
    frames = [f for f in slide.findall('.//p:graphicFrame', ns) if f.find('.//c:chart', ns) is not None]
    if not (len(frames) == len(elements)): raise ValueError("Draft chart package mismatch at check 23")
    for element in elements:
        want = element['chartData']
        matches = [f for f in frames if f.find('p:nvGraphicFramePr/p:cNvPr', ns).attrib['name'] == element['id']]
        if not (len(matches) == 1): raise ValueError("Draft chart package mismatch at check 27")
        frame = matches[0]
        offset, extent = frame.find('p:xfrm/a:off', ns), frame.find('p:xfrm/a:ext', ns)
        for attribute, key in [('x', 'x'), ('y', 'y')]:
            if not (abs(int(offset.attrib[attribute]) - element[key] * 9525) <= 1): raise ValueError("Draft chart package mismatch at check 31")
        for attribute, key in [('cx', 'w'), ('cy', 'h')]:
            if not (abs(int(extent.attrib[attribute]) - element[key] * 9525) <= 1): raise ValueError("Draft chart package mismatch at check 33")
        part = target(z, slide_part, frame.find('.//c:chart', ns).attrib['{' + ns['r'] + '}id'], 'chart')
        if not (part not in seen): raise ValueError("Draft chart package mismatch at check 35")
        seen.append(part)
        root = E.fromstring(z.read(part))
        tag = {'bar': 'barChart', 'line': 'lineChart', 'pie': 'pieChart'}[want['type']]
        chart = root.find('.//c:' + tag, ns)
        if not (chart is not None): raise ValueError("Draft chart package mismatch at check 40")
        if want['type'] == 'bar':
            if not (chart.find('c:barDir', ns).attrib['val'] == ('col' if want['direction'] == 'column' else 'bar')): raise ValueError("Draft chart package mismatch at check 42")
        series = chart.findall('c:ser', ns)
        if not (len(series) == len(want['series'])): raise ValueError("Draft chart package mismatch at check 44")
        external = root.find('c:externalData', ns)
        if not (external is not None): raise ValueError("Draft chart package mismatch at check 46")
        workbook_part = target(z, part, external.attrib['{' + ns['r'] + '}id'], 'package')
        book = zipfile.ZipFile(io.BytesIO(z.read(workbook_part)))
        sheet_name, worksheet = read_worksheet(book)
        cells = {c.attrib['r']: c for c in worksheet.findall('.//x:c', ns)}
        shared = []
        if 'xl/sharedStrings.xml' in book.namelist():
            shared = [''.join(t.text or '' for t in s.findall('.//x:t', ns)) for s in E.fromstring(book.read('xl/sharedStrings.xml')).findall('x:si', ns)]
        def cell_value(ref):
            cell = cells[ref]
            if not (cell.find('x:f', ns) is None): raise ValueError("Draft chart package mismatch at check 56")
            if cell.attrib.get('t') == 'inlineStr':
                return ''.join(t.text or '' for t in cell.findall('.//x:t', ns))
            value = cell.find('x:v', ns).text
            return shared[int(value)] if cell.attrib.get('t') == 's' else value
        def compare(container, wanted, numeric=False):
            formula = container.find('.//c:f', ns)
            if not (formula is not None): raise ValueError("Draft chart package mismatch at check 63")
            col, start, end = formula_range(formula.text, sheet_name)
            actual = [cell_value(col + str(i)) for i in range(start, end + 1)]
            points = container.findall('.//c:pt', ns)
            if not ([int(p.attrib['idx']) for p in points] == list(range(len(wanted)))): raise ValueError("Draft chart package mismatch at check 69")
            cache = [p.find('c:v', ns).text or '' for p in points]
            if not (len(actual) == len(cache) == len(wanted)): raise ValueError("Draft chart package mismatch at check 71")
            if numeric:
                if not (list(map(Decimal, actual)) == list(map(Decimal, cache)) == [Decimal(str(v)) for v in wanted]): raise ValueError("Draft chart package mismatch at check 73")
                if not (container.find('.//c:formatCode', ns).text == want['numberFormat']): raise ValueError("Draft chart package mismatch at check 74")
            else:
                if not (actual == cache == wanted): raise ValueError("Draft chart package mismatch at check 76")
        for actual, desired in zip(series, want['series']):
            compare(actual.find('c:cat', ns), want['categories'])
            compare(actual.find('c:val', ns), desired['values'], True)
            compare(actual.find('c:tx', ns), [desired['name']])
        if not ((want['title'] + ' (' + want['unit'] + ')' if want['type'] == 'pie' else want['title']) == ''.join(t.text or '' for t in root.findall('./c:chart/c:title//a:t', ns))): raise ValueError("Draft chart package mismatch at check 81")
print(json.dumps({'charts': len(seen), 'chartParts': seen, 'nativeChartDataMatchesSavedVersion': True, 'embeddedWorkbookDataMatches': True, 'deckSha256': hashlib.sha256(open(sys.argv[1], 'rb').read()).hexdigest()}))
