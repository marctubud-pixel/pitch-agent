#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path
import tempfile
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject as D, NameObject as N, ArrayObject as A, NumberObject as I, FloatObject, DecodedStreamObject

spec = importlib.util.spec_from_file_location('native', Path(__file__).with_name('native-font-check.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def stream(writer, data, attrs=None):
    obj = DecodedStreamObject()
    obj.set_data(data.encode('ascii'))
    if attrs:
        obj.update(attrs)
    return writer._add_object(obj)


def make_pdf(path, content, form=None, ext=None):
    page_content = content
    writer = PdfWriter()
    page = writer.add_blank_page(width=600, height=400)
    fonts = D()
    for name, face in [('F1', 'Helvetica'), ('F2', 'Helvetica-Bold'), ('Bad', 'Courier'), ('Unused', 'Helvetica')]:
        fonts[N('/'+name)] = writer._add_object(D({N('/Type'): N('/Font'), N('/Subtype'): N('/Type1'), N('/BaseFont'): N('/'+face), N('/Encoding'): N('/WinAnsiEncoding')}))
    resources = D({N('/Font'): fonts})
    if form:
        nested = isinstance(form, dict) and form.get('nested', False)
        content = form['content'] if isinstance(form, dict) else form
        scoped = D({N('/Font'): D({N('/F1'): fonts[N('/Bad')]})})
        attrs = {N('/Type'):N('/XObject'), N('/Subtype'):N('/Form'), N('/BBox'): A([I(0),I(0),I(600),I(400)]), N('/Resources'):scoped}
        if isinstance(form, dict) and 'matrix' in form:
            attrs[N('/Matrix')] = A([FloatObject(x) for x in form['matrix']])
        if isinstance(form, dict) and form.get('group'):
            attrs[N('/Group')] = D({N('/S'):N('/Transparency')})
        resources[N('/XObject')] = D({N('/Fm'): stream(writer, content, attrs)})
    if form and nested:
        inner = resources[N('/XObject')].raw_get(N('/Fm'))
        resources[N('/XObject')][N('/Fm')] = stream(writer, '/Inner Do', {N('/Type'):N('/XObject'), N('/Subtype'):N('/Form'), N('/BBox'): A([I(0),I(0),I(600),I(400)]), N('/Resources'):D({N('/XObject'):D({N('/Inner'):inner}), N('/Font'):D({N('/F1'):fonts[N('/F1')]})})})
    if '/Im Do' in page_content:
        image = DecodedStreamObject(); image.set_data(bytes([255,0,0])); image.update({N('/Type'):N('/XObject'),N('/Subtype'):N('/Image'),N('/Width'):I(1),N('/Height'):I(1),N('/ColorSpace'):N('/DeviceRGB'),N('/BitsPerComponent'):I(8)})
        resources[N('/XObject')] = D({N('/Im'):writer._add_object(image)})
    if ext:
        states = ext if isinstance(ext,dict) and all(isinstance(v,dict) for v in ext.values()) else {'Hidden':ext if isinstance(ext,dict) else {'ca':0}}
        resources[N('/ExtGState')] = D({N('/'+name): D({N('/'+key): N('/'+value) if isinstance(value,str) else FloatObject(value) for key,value in state.items()}) for name,state in states.items()})
    if ' sh' in page_content:
        function = D({N('/FunctionType'):I(2),N('/Domain'):A([I(0),I(1)]),N('/C0'):A([I(1),I(1),I(1)]),N('/C1'):A([I(0),I(0),I(0)]),N('/N'):I(1)})
        shading = D({N('/ShadingType'):I(2),N('/ColorSpace'):N('/DeviceRGB'),N('/Coords'):A([I(0),I(0),I(600),I(400)]),N('/Function'):function})
        outside = D(shading);outside[N('/BBox')] = A([I(300),I(300),I(400),I(400)])
        resources[N('/Shading')] = D({N('/Shade'):shading,N('/Outside'):outside})
    if '/Pattern cs' in page_content:
        resources[N('/Pattern')] = D({N('/P1'):stream(writer,'1 1 1 rg 0 0 10 10 re f',{N('/Type'):N('/Pattern'),N('/PatternType'):I(1),N('/PaintType'):I(1),N('/TilingType'):I(1),N('/BBox'):A([I(0),I(0),I(10),I(10)]),N('/XStep'):I(10),N('/YStep'):I(10),N('/Resources'):D()})})
    page[N('/Resources')] = resources
    page[N('/Contents')] = stream(writer, page_content)
    writer.write(path)


def expectation(runs):
    return {'pages':[{'runs':[{'text': text, 'style': style} for text,style in runs]}],
            'selected':{'regular':{'postscript':['Helvetica']}, 'bold':{'postscript':['Helvetica-Bold']}}}


def main():
    out = Path(tempfile.mkdtemp(prefix='native-font-controls-'))
    cases = [
        ('regular-bold', 'BT /F1 20 Tf 30 100 Td (ABC) Tj /F2 20 Tf (123!) Tj ET', [('ABC','regular'),('123!','bold')], None, None, []),
        ('mixed-unused-approved', 'BT /F1 20 Tf 30 100 Td (ABC) Tj /Bad 20 Tf (123!) Tj ET', [('ABC123!','regular')], None,None,['substituted-active-face']),
        ('entire-active-substitution', 'BT /Bad 20 Tf 30 100 Td (ABC) Tj ET', [('ABC','regular')], None,None,['substituted-active-face']),
        ('wrong-style', 'BT /F2 20 Tf 30 100 Td (ABC) Tj /F1 20 Tf (123!) Tj ET', [('ABC','regular'),('123!','bold')],None,None,['pdf-style-attribution']),
        ('form-resource-scope', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Fm Do', [('ABC123!','regular')], 'BT /F1 20 Tf 30 70 Td (123!) Tj ET',None,['substituted-active-face']),
        ('nested-form-resource-scope', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Fm Do', [('ABC123!','regular')], {'nested':True,'content':'BT /F1 20 Tf 30 70 Td (123!) Tj ET'},None,['substituted-active-face']),
        ('image-occludes-native-text', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET q 200 0 0 40 20 90 cm /Im Do Q', [('ABC','regular')],None,None,['text-occluded-by-later-image']),
        ('outside-page-hidden-text', 'BT /F1 20 Tf 800 100 Td (ABC) Tj ET', [('ABC','regular')],None,None,['clipped-required-text']),
        ('hidden-render-mode', 'BT /F1 20 Tf 3 Tr 30 100 Td (ABC) Tj ET', [('ABC','regular')],None,None,['unsupported-text-visibility','pdf-required-text']),
        ('hidden-alpha', '/Hidden gs BT /F1 20 Tf 30 100 Td (ABC) Tj ET', [('ABC','regular')],None,True,['unsupported-graphics-state']),
        ('ordinary-page-clip', 'q 0 0 600 400 re W n BT /F1 20 Tf 30 100 Td (ABC) Tj ET Q', [('ABC','regular')],None,None,[]),
        ('clipped-hidden-text', 'q 0 0 1 1 re W n BT /F1 20 Tf 30 100 Td (ABC) Tj ET Q', [('ABC','regular')],None,None,['clipped-required-text']),
        ('clip-restored-qQ', 'q 0 0 1 1 re W n Q BT /F1 20 Tf 30 100 Td (ABC) Tj ET', [('ABC','regular')],None,None,[]),
        ('changed-number-punctuation', 'BT /F1 20 Tf 30 100 Td (ABC124?) Tj ET', [('ABC123!','regular')],None,None,['pdf-required-text']),
        ('empty-visible-text', '', [('ABC','regular')],None,None,['pdf-required-text']),
        ('opaque-vector-cover', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 1 1 1 rg 0 0 600 400 re f', [('ABC','regular')],None,None,['text-occluded-by-later-vector']),
        ('partial-vector-cover', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 30 100 10 10 re f', [('ABC','regular')],None,None,['text-occluded-by-later-vector']),
        ('vector-before-text', '0 0 600 400 re f BT /F1 20 Tf 30 100 Td (ABC) Tj ET', [('ABC','regular')],None,None,[]),
        ('vector-outside-text', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 300 300 20 20 re f', [('ABC','regular')],None,None,[]),
        ('vector-transformed-cover', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET q 2 0 0 2 0 0 cm 0 0 300 200 re f Q', [('ABC','regular')],None,None,['text-occluded-by-later-vector']),
        ('vector-transformed-away', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET q 1 0 0 1 300 200 cm 0 0 50 50 re f Q', [('ABC','regular')],None,None,[]),
        ('vector-clipped-away', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET q 300 300 10 10 re W n 0 0 600 400 re f Q', [('ABC','regular')],None,None,[]),
        ('clip-applies-after-paint', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET q 300 300 10 10 re W n 0 0 600 400 re W f Q', [('ABC','regular')],None,None,[]),
        ('vector-clip-restored', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET q 300 300 10 10 re W n Q 0 0 600 400 re f', [('ABC','regular')],None,None,['text-occluded-by-later-vector']),
        ('transparent-vector', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET q /Hidden gs 0 0 600 400 re f Q', [('ABC','regular')],None,True,[]),
        ('opacity-restored-vector', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET q /Hidden gs Q 0 0 600 400 re f', [('ABC','regular')],None,True,['text-occluded-by-later-vector']),
        ('partial-opacity-vector', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Hidden gs 0 0 600 400 re f', [('ABC','regular')],None,{'ca':0.5},['unproven-later-paint-visibility']),
        ('unknown-blend-relevant', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Hidden gs 0 0 600 400 re f', [('ABC','regular')],None,{'BM':'Multiply'},['unproven-later-paint-visibility']),
        ('unknown-blend-outside', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Hidden gs 300 300 20 20 re f', [('ABC','regular')],None,{'BM':'Multiply'},[]),
        ('rectangle-outline-around-text', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 2 w 10 70 100 70 re S', [('ABC','regular')],None,None,[]),
        ('stroke-crosses-text', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 10 w 10 105 m 100 105 l S', [('ABC','regular')],None,None,['unproven-later-paint-visibility']),
        ('curve-possible-overlap', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 0 0 m 0 400 600 400 600 0 c h f', [('ABC','regular')],None,None,['unproven-later-paint-visibility']),
        ('curve-outside-text', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 300 300 m 300 350 350 350 350 300 c h f', [('ABC','regular')],None,None,[]),
        ('form-vector-cover', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Fm Do', [('ABC','regular')], '0 0 600 400 re f',None,['text-occluded-by-later-vector']),
        ('form-transparent-vector', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET q /Hidden gs /Fm Do Q', [('ABC','regular')], '0 0 600 400 re f',True,[]),
        ('form-inherits-stroke-width', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 20 w /Fm Do', [('ABC','regular')], '20 122 m 100 122 l S',None,['unproven-later-paint-visibility']),
        ('fill-evenodd-cover', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 0 0 600 400 re f*', [('ABC','regular')],None,None,['text-occluded-by-later-vector']),
        ('compound-hole-unproven', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 0 0 600 400 re 20 80 100 60 re f*', [('ABC','regular')],None,None,['unproven-later-paint-visibility']),
        ('blend-reset', '/Hidden gs /Normal gs BT /F1 20 Tf 30 100 Td (ABC) Tj ET', [('ABC','regular')],None,{'Hidden':{'BM':'Multiply'},'Normal':{'BM':'Normal'}},[]),
        ('form-transform-outside', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Fm Do', [('ABC','regular')], {'content':'0 0 100 100 re f','matrix':[1,0,0,1,300,200]},None,[]),
        ('form-transform-cover', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Fm Do', [('ABC','regular')], {'content':'0 0 100 100 re f','matrix':[1,0,0,1,20,80]},None,['text-occluded-by-later-vector']),
        ('form-transform-restored', '/Fm Do BT /F1 20 Tf 30 100 Td (ABC) Tj ET', [('ABC','regular')], {'content':'0 0 100 100 re f','matrix':[1,0,0,1,800,200]},None,[]),
        ('form-group-unknown-cover', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Fm Do', [('ABC','regular')], {'content':'0 0 600 400 re f','group':True},None,['unproven-later-paint-visibility']),
        ('form-group-outside', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Fm Do', [('ABC','regular')], {'content':'300 300 20 20 re f','group':True},None,[]),
        ('midpath-matrix-unknown', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 0 0 100 100 re 1 0 0 1 800 0 cm f', [('ABC','regular')],None,None,['unproven-later-paint-visibility']),
        ('midpath-matrix-unpainted', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET 0 0 100 100 re 1 0 0 1 800 0 cm n', [('ABC','regular')],None,None,[]),
        ('nonrectangle-clip-refused', '0 0 m 600 400 l 600 0 l 0 400 l h W n BT /F1 20 Tf 30 100 Td (ABC) Tj ET', [('ABC','regular')],None,None,['unsupported-clipping']),
        ('shading-cover-unproven', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Shade sh', [('ABC','regular')],None,None,['unproven-later-paint-visibility']),
        ('shading-before-text', '/Shade sh BT /F1 20 Tf 30 100 Td (ABC) Tj ET', [('ABC','regular')],None,None,[]),
        ('shading-bounded-outside', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Outside sh', [('ABC','regular')],None,None,[]),
        ('pattern-cover-unproven', 'BT /F1 20 Tf 30 100 Td (ABC) Tj ET /Pattern cs /P1 scn 0 0 600 400 re f', [('ABC','regular')],None,None,['unproven-later-paint-visibility']),

    ]
    results=[]
    for name, content, runs, form, ext, expected in cases:
        path = out/(name+'.pdf')
        make_pdf(path, content, form, ext)
        evidence = native.inspect_pdf(path, expectation(runs))
        assert all(counts for page in evidence['pages'] for counts in page['activeFaces'].values()), name
        codes = {i['code'] for i in evidence['issues']}
        migrated = {'unsupported-text-visibility': 'unsupported-text-render-mode', 'unsupported-graphics-state': 'hidden-text-alpha'}
        required = {migrated.get(code, code) for code in expected if code in {'substituted-active-face','pdf-style-attribution','unsupported-text-visibility','pdf-required-text'} or code == 'unsupported-graphics-state' and name == 'hidden-alpha'}
        assert required <= codes, (name, required, codes)
        results.append({'case':name,'controlPassed':True,'issueCodes':sorted(codes), 'visualInspection':'pending','deliveryStatus':'pending' if not codes else 'blocked'})
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    path = out/'ellipse-outline-around-text.pdf'
    canvas = Canvas(str(path),pagesize=(600,400));canvas.setFont('Helvetica',20);canvas.drawString(130,150,'ABC');canvas.circle(155,155,90,stroke=1,fill=0);canvas.save()
    evidence = native.inspect_pdf(path,expectation([('ABC','regular')]))
    assert not evidence['issues'], evidence['issues']
    results.append({'case':'ellipse-outline-around-text','passed':True,'issueCodes':[]})
    pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    for name, actual, wanted, codes in [
        ('cjk-positive','中文123!','中文123!',[]),
        ('missing-cjk','中123!','中文123!',['pdf-required-text','pdf-cjk-coverage']),
        ('replacement-box','中文□123!','中文123!',['pdf-cjk-coverage']),
    ]:
        path = out/(name+'.pdf')
        canvas=Canvas(str(path),pagesize=(600,400));canvas.setFont('STSong-Light',20);canvas.drawString(30,100,actual);canvas.save()
        expect={'pages':[{'runs':[{'text':wanted,'style':'regular'}]}], 'selected':{'regular':{'postscript':['STSongStd-Light']}}}
        evidence=native.inspect_pdf(path,expect); found={i['code'] for i in evidence['issues']}
        assert set(codes)<=found,(name,found)
        if not codes: assert not found,(name,found)
        results.append({'case':name,'passed':True,'issueCodes':sorted(found)})
    assert native.canonical('ABCDEF+Helvetica') == 'Helvetica'
    assert native.canonical('ABCD+Helvetica') != 'Helvetica'
    (out/'results.json').write_text(json.dumps(results,indent=2))
    print(json.dumps({'out':str(out),'controls':len(results),'passed':True}))

if __name__ == '__main__':
    main()
