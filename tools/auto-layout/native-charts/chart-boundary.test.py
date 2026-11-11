"""Actual finalized PPTX regression cases derived from independent review."""
import importlib.util,io,json,pathlib,subprocess,sys,tempfile,zipfile
from xml.etree import ElementTree as E
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('chart_verify',HERE/'chart-package-verify.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
root=pathlib.Path(sys.argv[1]);node=sys.argv[2]
expected=json.loads(subprocess.check_output([node,str(HERE/'chart-cli.mjs'),'parse',str(root/'source.json'),str(root/'original-sources.json')],text=True));manifest=json.loads((root/'manifest.json').read_text())
with zipfile.ZipFile(root/'delivery/synthetic-native-charts.pptx') as z:original={n:z.read(n) for n in z.namelist()}
chart='ppt/slides/charts/chart1.xml';wb='ppt/embeddings/chart-data-snapshot-001.xlsx';N=v.NS;C='{'+N['c']+'}';S='{'+N['s']+'}'
def pack(p):
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:
  for n,d in p.items():z.writestr(n,d)
 return b.getvalue()
def edit(p,n,fn):
 r=E.fromstring(p[n]);fn(r);p[n]=E.tostring(r,encoding='utf-8',xml_declaration=True)
def worksheet(p,fn):
 with zipfile.ZipFile(io.BytesIO(p[wb])) as z:w={n:z.read(n) for n in z.namelist()}
 edit(w,'xl/worksheets/sheet1.xml',fn);p[wb]=pack(w)
def hidden(p,kind,value):
 def op(r):
  n=r.find(".//s:row[@r='2']",N) if kind=='row' else E.SubElement(E.SubElement(r,S+'cols'),S+'col',min='1',max='1')
  n.set('hidden',value)
 worksheet(p,op)
def shared(p,value):
 with zipfile.ZipFile(io.BytesIO(p[wb])) as z:w={n:z.read(n) for n in z.namelist()}
 r=E.Element(S+'sst');E.SubElement(E.SubElement(r,S+'si'),S+'t').text='2024';w['xl/sharedStrings.xml']=E.tostring(r)
 def op(r):
  c=r.find(".//s:c[@r='A2']",N)
  for child in list(c):c.remove(child)
  c.set('t','s');E.SubElement(c,S+'v').text=value
 edit(w,'xl/worksheets/sheet1.xml',op);p[wb]=pack(w)
def add(p,path,tag,**attrs):edit(p,chart,lambda r:E.SubElement(r.find(path,N),C+tag,**attrs))
def attr(p,path,value,key='val'):edit(p,chart,lambda r:r.find(path,N).set(key,value))
def bounds(p,minimum=None,maximum=None):
 def op(r):
  s=r.find('.//c:valAx/c:scaling',N)
  if minimum is not None:E.SubElement(s,C+'min',val=minimum)
  if maximum is not None:E.SubElement(s,C+'max',val=maximum)
 edit(p,chart,op)
cases=[]
for kind in ['row','col']:
 for lexical in ['1','true',' true ','\t1\n']:
  cases.append((f'hidden {kind} {lexical!r}','CHART_WORKBOOK_HIDDEN',lambda p,k=kind,x=lexical:hidden(p,k,x)))
 for lexical in ['0','false',' false ','\t0\n']:
  cases.append((f'visible {kind} {lexical!r}',None,lambda p,k=kind,x=lexical:hidden(p,k,x)))
 for lexical in ['yes','TRUE','','2','1 0']:
  cases.append((f'malformed hidden {kind} {lexical!r}','CHART_WORKBOOK_BOOLEAN',lambda p,k=kind,x=lexical:hidden(p,k,x)))
for lexical in ['-1','-0','1','999','0.0','0e0','+0','','NaN',' 0 ','٠']:
 cases.append((f'shared-string index {lexical!r}','CHART_WORKBOOK_STRING',lambda p,x=lexical:shared(p,x)))
cases.append(('shared-string valid zero',None,lambda p:shared(p,'0')))
for path,tag in [('.//c:ser/c:val','numLit'),('.//c:ser/c:val','unknown'),('.//c:ser/c:val/c:numRef','numLit'),('.//c:ser/c:val/c:numRef','unknown'),('.//c:ser/c:val/c:numRef','numCache'),('.//c:ser/c:cat/c:strRef','unknown')]:
 cases.append((f'closed reference {path} {tag}','CHART_RANGE',lambda p,x=path,t=tag:add(p,x,t)))
for axis in ['catAx','valAx']:
 cases.append((f'{axis} reversed','CHART_AXIS_SEMANTICS',lambda p,a=axis:attr(p,f'.//c:{a}/c:scaling/c:orientation','maxMin')))
 cases.append((f'{axis} wrong position','CHART_AXIS_SEMANTICS',lambda p,a=axis:attr(p,f'.//c:{a}/c:axPos','r')))
 cases.append((f'{axis} log scale','CHART_AXIS_SEMANTICS',lambda p,a=axis:add(p,f'.//c:{a}/c:scaling','logBase',val='10')))
 cases.append((f'{axis} moved crossing','CHART_AXIS_SEMANTICS',lambda p,a=axis:add(p,f'.//c:{a}','crosses',val='max')))
 cases.append((f'{axis} wrong cross id','CHART_AXIS_SEMANTICS',lambda p,a=axis:attr(p,f'.//c:{a}/c:crossAx','1')))
for lo,hi in [('0.5','1'),('-1','-0.5'),('1','0'),('NaN','1'),('-1','INF'),('0','1')]:
 cases.append((f'axis bounds {lo} {hi}','CHART_AXIS_BOUNDS',lambda p,l=lo,h=hi:bounds(p,l,h)))
cases.extend([('axis containing bounds',None,lambda p:bounds(p,'-1','1')),('category bounds','CHART_AXIS_SEMANTICS',lambda p:add(p,'.//c:catAx/c:scaling','min',val='1')),('duplicate axis bound','CHART_AXIS_BOUNDS',lambda p:(bounds(p,'-1','1'),add(p,'.//c:valAx/c:scaling','min',val='-2'))),('unknown axis type','CHART_AXIS_SEMANTICS',lambda p:add(p,'.//c:plotArea','dateAx')),('duplicate native axis id','CHART_AXIS_SEMANTICS',lambda p:edit(p,chart,lambda r:r.find('.//c:barChart/c:axId',N).set('val',r.find('.//c:barChart/c:axId[2]',N).get('val'))))])
def root_targets(p):
 for name in list(p):
  if name.endswith('.rels'):
   owner='' if name=='_rels/.rels' else v.posixpath.join(v.posixpath.dirname(v.posixpath.dirname(name)),v.posixpath.basename(name)[:-5])
   def op(r):
    for rel in r:
     target=rel.get('Target','')
     rel.set('Target','/'+v.posixpath.normpath(target[1:] if target.startswith('/') else v.posixpath.join(v.posixpath.dirname(owner),target)))
   edit(p,name,op)
 with zipfile.ZipFile(io.BytesIO(p[wb])) as z:w={n:z.read(n) for n in z.namelist()}
 root_workbook_targets(w);p[wb]=pack(w)
def root_workbook_targets(w):
 for name in list(w):
  if name.endswith('.rels'):
   owner='' if name=='_rels/.rels' else v.posixpath.join(v.posixpath.dirname(v.posixpath.dirname(name)),v.posixpath.basename(name)[:-5])
   def op(r):
    for rel in r:
     target=rel.get('Target','');rel.set('Target','/'+v.posixpath.normpath(target[1:] if target.startswith('/') else v.posixpath.join(v.posixpath.dirname(owner),target)))
   edit(w,name,op)
def unused_link(p,embedded,target,mode):
 def insert(w):
  def op(r):E.SubElement(r,'{'+N['pr']+'}Relationship',Id='independent-link',Type='urn:unapproved',Target=target,TargetMode=mode)
  edit(w,'_rels/.rels',op)
 if embedded:
  with zipfile.ZipFile(io.BytesIO(p[wb])) as z:w={n:z.read(n) for n in z.namelist()}
  insert(w);p[wb]=pack(w)
 else:insert(p)
cases.append(('legal root absolute OPC targets outer and workbook',None,root_targets))
for embedded in [False,True]:
 for target,mode in [('https://example.invalid/file','External'),('file:///tmp/data.xlsx','Internal'),('//host/file','Internal'),('../escape','Internal'),('xl%2Fworkbook.xml','Internal')]:
  code='CHART_REL_TARGET' if target=='../escape' else 'CHART_EXTERNAL_REL'
  cases.append((f'link boundary embedded={embedded} {target}',code,lambda p,e=embedded,t=target,m=mode:unused_link(p,e,t,m)))
cases.extend([('ZIP member size resource bound','CHART_ZIP_BOUND',lambda p:p.update({'oversized.bin':b'0'*(8*1024*1024+1)})),('ZIP member count bound','CHART_ZIP_BOUND',lambda p:p.update({f'bound/{i}.bin':b'0' for i in range(513)})),('XML node resource bound','CHART_XML_BOUND',lambda p:p.update({chart:('<r>'+'<n/>'*50001+'</r>').encode()}))])
out=pathlib.Path(tempfile.mkdtemp(prefix='boundary-regressions-',dir=root));results=[]
for i,(name,code,fn) in enumerate(cases):
 p=dict(original);fn(p);f=out/f'{i+1:03}.pptx';f.write_bytes(pack(p));actual=None
 try:v.verify(str(f),expected,manifest)
 except Exception as e:actual=str(e)
 passed=(actual is None if code is None else actual is not None and actual.startswith(code))
 results.append({'name':name,'expected':code,'actual':actual,'passed':passed})
(out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps({'passed':sum(x['passed'] for x in results),'total':len(results),'failures':[x for x in results if not x['passed']],'results':str(out/'results.json')},indent=2));sys.exit(not all(x['passed'] for x in results))
