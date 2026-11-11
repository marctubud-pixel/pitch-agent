import posixpath, re
import xml.etree.ElementTree as E

X = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

def worksheet(package):
    book = E.fromstring(package.read('xl/workbook.xml'))
    sheets = book.findall('{%s}sheets/{%s}sheet' % (X, X))
    if len(sheets) != 1:
        raise ValueError('Draft chart package mismatch: expected one snapshot sheet')
    sheet = sheets[0]
    rels = E.fromstring(package.read('xl/_rels/workbook.xml.rels'))
    matches = [r for r in rels if r.get('Id') == sheet.get('{%s}id' % R)]
    if len(matches) != 1:
        raise ValueError('Draft chart package mismatch: sheet relationship')
    rel = matches[0]
    if not rel.get('Type', '').endswith('/worksheet') or rel.get('TargetMode', 'Internal') != 'Internal':
        raise ValueError('Draft chart package mismatch: worksheet target')
    raw = rel.get('Target', '')
    part = posixpath.normpath(raw.lstrip('/') if raw.startswith('/') else posixpath.join('xl', raw))
    if not part.startswith('xl/'):
        raise ValueError('Draft chart package mismatch: worksheet path')
    return sheet.attrib['name'], E.fromstring(package.read(part))

def formula_range(formula, sheet_name):
    match = re.fullmatch(r"(?:'((?:[^'\[\]]|'')+)'|([A-Za-z_][A-Za-z0-9_]*))!\$?([A-Z]{1,3})\$?([1-9][0-9]*)(?::\$?([A-Z]{1,3})\$?([1-9][0-9]*))?", formula or '')
    if match is None:
        raise ValueError('Draft chart package mismatch: unsupported formula')
    name = match[1].replace("''", "'") if match[1] is not None else match[2]
    col, start, end_col, end = match[3], int(match[4]), match[5] or match[3], int(match[6] or match[4])
    if name != sheet_name or col != end_col or not 1 <= start <= end <= 101:
        raise ValueError('Draft chart package mismatch: formula worksheet or range')
    return col, start, end
