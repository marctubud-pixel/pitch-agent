import hashlib, io, json, posixpath, re, sys, zipfile
import xml.etree.ElementTree as E
from editable_chart_refs import worksheet, formula_range

source, destination = sys.argv[1:3]
ns = {'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
E.register_namespace('c', ns['c']); E.register_namespace('r', ns['r'])
archive = zipfile.ZipFile(source)
changed = {}; count = 0
for part in archive.namelist():
    if not part.endswith('.xml') or '/charts/' not in part or '/_rels/' in part:
        continue
    root = E.fromstring(archive.read(part))
    if root.tag != '{' + ns['c'] + '}chartSpace':
        continue
    external = root.find('c:externalData', ns)
    if not (external is not None): raise ValueError("Draft chart package mismatch at check 16")
    rels = E.fromstring(archive.read(posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part) + '.rels')))
    rel = next(r for r in rels if r.attrib['Id'] == external.attrib['{' + ns['r'] + '}id'])
    if not (rel.attrib['Type'].endswith('/package') and rel.attrib.get('TargetMode', 'Internal') == 'Internal'): raise ValueError("Draft chart package mismatch at check 19")
    target = posixpath.normpath(rel.attrib['Target'].lstrip('/') if rel.attrib['Target'].startswith('/') else posixpath.join(posixpath.dirname(part), rel.attrib['Target']))
    workbook = zipfile.ZipFile(io.BytesIO(archive.read(target)))
    sheet_name, sheet = worksheet(workbook)
    for formula in root.findall('.//c:f', ns):
        formula_range(formula.text, sheet_name)
    cells = {c.attrib['r']: c for c in sheet.findall('.//x:c', ns)}
    for series in root.findall('.//c:ser', ns):
        tx = series.find('c:tx', ns)
        if not (tx is not None): raise ValueError("Draft chart package mismatch at check 26")
        literal = tx.find('c:v', ns)
        if literal is None:
            if not (tx.find('c:strRef/c:f', ns) is not None): raise ValueError("Draft chart package mismatch at check 29")
            continue
        formula = series.find('c:val/c:numRef/c:f', ns).text
        col, start, end = formula_range(formula, sheet_name)
        if start != 2:
            raise ValueError('Draft chart package mismatch: data range must start at row 2')
        header = cells[col + '1']
        if not (header.attrib.get('t') == 'inlineStr' and header.find('x:f', ns) is None): raise ValueError("Draft chart package mismatch at check 36")
        value = ''.join(t.text or '' for t in header.findall('.//x:t', ns))
        if not (value == literal.text): raise ValueError("Draft chart package mismatch at check 38")
        tx.remove(literal)
        ref = E.SubElement(tx, '{' + ns['c'] + '}strRef')
        E.SubElement(ref, '{' + ns['c'] + '}f').text = "'" + sheet_name.replace("'", "''") + "'!$" + col + "$1"
        cache = E.SubElement(ref, '{' + ns['c'] + '}strCache')
        E.SubElement(cache, '{' + ns['c'] + '}ptCount', {'val': '1'})
        point = E.SubElement(cache, '{' + ns['c'] + '}pt', {'idx': '0'})
        E.SubElement(point, '{' + ns['c'] + '}v').text = value
        count += 1
    changed[part] = E.tostring(root, encoding='utf-8', xml_declaration=True)
with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_DEFLATED) as output:
    for entry in archive.infolist():
        output.writestr(entry, changed.get(entry.filename, archive.read(entry.filename)))
print(json.dumps({'version': 'draft-series-header-links-v1', 'linkedSeriesNames': count, 'sourceFormulasPreserved': False, 'inputSha256': hashlib.sha256(open(source,'rb').read()).hexdigest(), 'outputSha256': hashlib.sha256(open(destination,'rb').read()).hexdigest()}))
