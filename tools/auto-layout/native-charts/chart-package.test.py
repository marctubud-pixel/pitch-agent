"""Real-writer package mutations. Run with a fresh fixture output directory argument."""
import copy,importlib.util,io,json,pathlib,subprocess,sys,tempfile,zipfile
from xml.etree import ElementTree as ET
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('chart_package_verify',HERE/'chart-package-verify.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
root=pathlib.Path(sys.argv[1]).resolve();node=sys.argv[2]
expected=json.loads(subprocess.check_output([node,str(HERE/'chart-cli.mjs'),'parse',str(root/'source.json'),str(root/'original-sources.json')],text=True));manifest=json.loads((root/'manifest.json').read_text());deck=root/'delivery/synthetic-native-charts.pptx'
with zipfile.ZipFile(deck) as z:original={n:z.read(n) for n in z.namelist()}
chart=next(n for n in original if n.endswith('/charts/chart1.xml'));slide='ppt/slides/slide1.xml';wb='ppt/embeddings/chart-data-snapshot-001.xlsx';rels=chart.rsplit('/',1)[0]+'/_rels/chart1.xml.rels'
NS=v.NS

def edit(parts,name,operation):
    r=ET.fromstring(parts[name]);operation(r);parts[name]=ET.tostring(r,encoding='utf-8',xml_declaration=True)
def select(root,path):return root.find(path,NS)
def setatt(parts,name,path,attr,value):edit(parts,name,lambda r:select(r,path).set(attr,value))
def settext(parts,name,path,text):edit(parts,name,lambda r:setattr(select(r,path),'text',text))
def remove(parts,name,parent,path):edit(parts,name,lambda r:select(r,parent).remove(select(r,path)))
def workbook_edit(parts,path,op):
    with zipfile.ZipFile(io.BytesIO(parts[wb])) as z:w={n:z.read(n) for n in z.namelist()}
    edit(w,'xl/worksheets/sheet1.xml',lambda r:op(select(r,path)))
    parts[wb]=pack(w)
def pack(parts):
    data=io.BytesIO()
    with zipfile.ZipFile(data,'w',zipfile.ZIP_DEFLATED) as z:
        for n,b in parts.items():z.writestr(n,b)
    return data.getvalue()
def twice(parts):
    settext(parts,chart,'.//c:ser/c:val/c:numRef/c:numCache/c:pt/c:v','0.99')
    workbook_edit(parts,".//s:c[@r='B2']/s:v",lambda n:setattr(n,'text','0.99'))
def both_label(parts):
    settext(parts,chart,'.//c:ser/c:cat/c:strRef/c:strCache/c:pt/c:v','changed')
    workbook_edit(parts,".//s:c[@r='A2']/s:is/s:t",lambda n:setattr(n,'text','changed'))
def series_swap(parts):
    def op(r):
        n=select(r,'.//c:barChart');s=n.findall('c:ser',NS);a=list(n).index(s[0]);n.remove(s[0]);n.remove(s[1]);n.insert(a,s[1]);n.insert(a+1,s[0])
    edit(parts,chart,op)
def extra_frame(parts):
    def op(r):
        tree=select(r,'p:cSld/p:spTree');frame=copy.deepcopy(select(r,'.//p:graphicFrame'));select(frame,'p:nvGraphicFramePr/p:cNvPr').set('name','chart-unplanned');select(frame,'p:nvGraphicFramePr/p:cNvPr').set('id','999');tree.append(frame)
    edit(parts,slide,op)
def unknown_frame(parts):setatt(parts,slide,'.//a:graphicData','uri','urn:unknown')
def external(parts):
    def op(r):
        n=list(r)[0];n.set('Target','https://example.invalid/data.xlsx');n.set('TargetMode','External')
    edit(parts,rels,op)
def cache_only(parts):remove(parts,chart,'.','.//c:externalData')
cases=[
 ('cache changed','CHART_VALUE_SOURCE',lambda p:settext(p,chart,'.//c:ser/c:val/c:numRef/c:numCache/c:pt/c:v','0.99')),
 ('workbook changed','CHART_WORKBOOK_VALUE_SOURCE',lambda p:workbook_edit(p,".//s:c[@r='B2']/s:v",lambda n:setattr(n,'text','0.99'))),
 ('cache and workbook changed together','CHART_VALUE_SOURCE',twice),
 ('category and workbook changed together','CHART_CATEGORY_SOURCE',both_label),
 ('dropped category','CHART_POINT_INDEX',lambda p:remove(p,chart,'.//c:ser/c:cat/c:strRef/c:strCache','.//c:ser/c:cat/c:strRef/c:strCache/c:pt')),
 ('dropped series','CHART_SERIES_COUNT',lambda p:remove(p,chart,'.//c:barChart','.//c:barChart/c:ser')),
 ('series order','CHART_SERIES_ORDER',series_swap),
 ('series name','CHART_SERIES_NAME',lambda p:settext(p,chart,'.//c:ser/c:tx/c:v','changed')),
 ('workbook series label','CHART_WORKBOOK_SERIES_NAME',lambda p:workbook_edit(p,".//s:c[@r='B1']/s:is/s:t",lambda n:setattr(n,'text','changed'))),
 ('value reference range','CHART_RANGE',lambda p:settext(p,chart,'.//c:ser/c:val/c:numRef/c:f',"'Chart Data'!$B$3:$B$5")),
 ('category reference alias','CHART_RANGE',lambda p:settext(p,chart,'.//c:ser/c:cat/c:strRef/c:f',"'Chart Data'!$C$2:$C$4")),
 ('format changed','CHART_FORMAT',lambda p:setatt(p,chart,'.//c:valAx/c:numFmt','formatCode','0')),
 ('labels hidden','CHART_LABELS',lambda p:setatt(p,chart,'.//c:dLbls/c:showVal','val','0')),
 ('axis hidden','CHART_AXIS_HIDDEN',lambda p:setatt(p,chart,'.//c:catAx/c:delete','val','1')),
 ('negative sign lost','CHART_VALUE_SOURCE',lambda p:settext(p,chart,".//c:ser/c:val/c:numRef/c:numCache/c:pt[@idx='1']/c:v",'0.04')),
 ('zero becomes nonzero','CHART_VALUE_SOURCE',lambda p:settext(p,chart,".//c:ser/c:val/c:numRef/c:numCache/c:pt[@idx='2']/c:v",'1')),
 ('native chart name','CHART_NATIVE_FRAME',lambda p:setatt(p,slide,'.//p:graphicFrame/p:nvGraphicFramePr/p:cNvPr','name','chart-changed')),
 ('native chart geometry','CHART_GEOMETRY',lambda p:setatt(p,slide,'.//p:graphicFrame/p:xfrm/a:off','x','1')),
 ('hidden native frame','CHART_FRAME_HIDDEN',lambda p:setatt(p,slide,'.//p:graphicFrame/p:nvGraphicFramePr/p:cNvPr','hidden','1')),
 ('hidden workbook row','CHART_WORKBOOK_HIDDEN',lambda p:workbook_edit(p,".//s:row[@r='2']",lambda n:n.set('hidden','1'))),
 ('native chart removed','CHART_NATIVE_MISSING',lambda p:remove(p,slide,'p:cSld/p:spTree','.//p:graphicFrame')),
 ('unplanned native chart','CHART_NATIVE_FRAME',extra_frame),
 ('unknown graphicFrame','CHART_UNSUPPORTED_CONTAINER',unknown_frame),
 ('missing workbook','CHART_REL_TARGET',lambda p:p.pop(wb)),
 ('cache-only chart','CHART_WORKBOOK_MISSING',cache_only),
 ('external workbook','CHART_EXTERNAL_REL',external),
 ('chart font changed','CHART_FONT',lambda p:setatt(p,chart,'.//c:title//a:latin','typeface','Unknown')),
 ('chart font size changed','CHART_FONT_SIZE',lambda p:setatt(p,chart,'.//c:title//a:rPr','sz','500')),
 ('title changed','CHART_TITLE',lambda p:settext(p,chart,'.//c:title//a:t','changed')),
 ('unit changed','CHART_UNIT',lambda p:settext(p,chart,'.//c:valAx/c:title//a:t','changed')),
 ('bar direction changed','CHART_TYPE',lambda p:setatt(p,chart,'.//c:barDir','val','bar')),
 ('workbook formula inserted','CHART_WORKBOOK_FORMULA',lambda p:workbook_edit(p,".//s:c[@r='B2']",lambda n:ET.SubElement(n,'{'+NS['s']+'}f').__setattr__('text','1+1'))),
 ('ZIP path traversal','CHART_ZIP_PATH',lambda p:p.update({'../escape.xml':b'x'})),
 ('XML entity declaration','CHART_XML_BOUND',lambda p:p.update({chart:b'<!DOCTYPE x [<!ENTITY x "bad">]>'+p[chart]})),
]
results=[];out=pathlib.Path(tempfile.mkdtemp(prefix='package-mutations-',dir=root))
assert v.verify(str(deck),expected,manifest)['status']=='passed'
for i,(name,code,mutation) in enumerate(cases):
    parts=dict(original);mutation(parts);file=out/f'{i+1:02}.pptx';file.write_bytes(pack(parts))
    try:v.verify(str(file),expected,manifest)
    except v.ChartPackageError as e:
        assert str(e).startswith(code),(name,code,str(e));results.append({'name':name,'expectedError':code,'actualError':str(e),'passed':True})
    else:raise AssertionError('Mutation accepted '+name)
# Source manifest binding is checked independently before package inspection.
changed=copy.deepcopy(manifest);changed['catalogDigest']='0'*64
try:v.verify(str(deck),expected,changed)
except v.ChartPackageError as e:assert str(e)=='CHART_SOURCE_MANIFEST';results.append({'name':'source manifest mismatch','actualError':str(e),'passed':True})
else:raise AssertionError('changed source manifest accepted')
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps({'passed':len(results),'results':str(out/'results.json')},indent=2))
