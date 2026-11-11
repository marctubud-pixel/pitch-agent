"""Bounded independent OOXML inspector. Expected data arrives from the source parser, never the deck cache."""
import io,json,re,sys,zipfile,posixpath,hashlib,os,math
from decimal import Decimal,InvalidOperation
from xml.etree import ElementTree as ET
NS={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','c':'http://schemas.openxmlformats.org/drawingml/2006/chart','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','pr':'http://schemas.openxmlformats.org/package/2006/relationships'}
R='{'+NS['r']+'}'
class ChartPackageError(ValueError): pass
def require(ok,code,detail=''):
    if not ok: raise ChartPackageError(code+(' '+detail if detail else ''))
def sha(data): return hashlib.sha256(data).hexdigest()
def archive(data):
    require(len(data)<=32*1024*1024,'CHART_ZIP_BOUND')
    z=zipfile.ZipFile(io.BytesIO(data)); infos=z.infolist()
    require(len(infos)<=512,'CHART_ZIP_BOUND')
    names=[i.filename for i in infos]
    require(len(set(names))==len(names),'CHART_ZIP_DUPLICATE')
    total=0
    for i in infos:
        n=i.filename; total+=i.file_size
        require(n and not n.startswith('/') and '\\' not in n and all(p not in ('','..','.') for p in n.rstrip('/').split('/')),'CHART_ZIP_PATH',n)
        require(not i.flag_bits&1 and i.file_size<=8*1024*1024 and total<=64*1024*1024 and i.file_size<=max(1024*1024,i.compress_size*1000),'CHART_ZIP_BOUND',n)
    return z
def xml(z,name):
    require(name in z.namelist(),'CHART_MEMBER_MISSING',name)
    b=z.read(name);require(len(b)<=4*1024*1024 and not re.search(br'<!\s*(DOCTYPE|ENTITY)',b,re.I),'CHART_XML_BOUND',name)
    root=ET.fromstring(b);require(sum(1 for _ in root.iter())<=50000,'CHART_XML_BOUND',name);return root
def relationships(z,owner):
    name=posixpath.join(posixpath.dirname(owner),'_rels',posixpath.basename(owner)+'.rels') if owner else '_rels/.rels'
    if name not in z.namelist(): return {}
    result={}
    for rel in xml(z,name):
        rid=rel.get('Id');target=rel.get('Target','')
        require(rid and rid not in result,'CHART_REL_DUPLICATE')
        require(rel.get('TargetMode','Internal')=='Internal' and not re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',target) and not target.startswith('//') and '\\' not in target and '#' not in target and '?' not in target and '%' not in target,'CHART_EXTERNAL_REL',name)
        resolved=posixpath.normpath(target[1:] if target.startswith('/') else posixpath.join(posixpath.dirname(owner),target))
        require(not resolved.startswith('../') and resolved in z.namelist(),'CHART_REL_TARGET',resolved)
        result[rid]=(resolved,rel.get('Type',''))
    return result
def one(node,path,code='CHART_STRUCTURE'):
    found=node.findall(path,NS);require(len(found)==1,code,path);return found[0]
def txt(node,path):return ''.join(t.text or '' for t in node.findall(path,NS))
def val(node,path):return one(node,path).get('val')
def points(cache,expected,numeric=False):
    require(int(val(cache,'c:ptCount'))==len(expected),'CHART_POINT_COUNT')
    pts=cache.findall('c:pt',NS);require([p.get('idx') for p in pts]==[str(i) for i in range(len(expected))],'CHART_POINT_INDEX')
    actual=[one(p,'c:v').text or '' for p in pts]
    if numeric: require([Decimal(x) for x in actual]==[Decimal(x) for x in expected],'CHART_VALUE_SOURCE')
    else:require(actual==expected,'CHART_CATEGORY_SOURCE')
    return actual
def colnum(c):
    n=0
    for x in c:n=n*26+ord(x)-64
    return n
def colname(n):
    s=''
    while n:n,r=divmod(n-1,26);s=chr(65+r)+s
    return s
def xsd_boolean(value):
    normalized=value.strip(' \t\r\n')
    require(normalized in ('0','1','false','true'),'CHART_WORKBOOK_BOOLEAN')
    return normalized in ('1','true')
def reference(node,variants):
    children=list(node)
    require(len(children)==1 and children[0].tag in {'{'+NS['c']+'}'+v for v in variants},'CHART_RANGE')
    ref=children[0];cache='strCache' if ref.tag=='{'+NS['c']+'}strRef' else 'numCache'
    require([x.tag for x in ref]==['{'+NS['c']+'}f','{'+NS['c']+'}'+cache] and not ref.attrib,'CHART_RANGE')
    return ref,one(ref,'c:'+cache,'CHART_RANGE')
def axis_semantics(plot,native,chart):
    axes=[n for n in plot if n.tag.rsplit('}',1)[-1].endswith('Ax')]
    require(len(axes)==2 and {n.tag for n in axes}=={'{'+NS['c']+'}catAx','{'+NS['c']+'}valAx'},'CHART_AXIS_SEMANTICS')
    cat=one(plot,'c:catAx');value=one(plot,'c:valAx');ids=[val(a,'c:axId') for a in [cat,value]]
    require(len(set(ids))==2 and all(re.fullmatch(r'[0-9]+',x or '') and int(x)<=4294967295 for x in ids),'CHART_AXIS_SEMANTICS')
    require([n.get('val') for n in native.findall('c:axId',NS)]==ids,'CHART_AXIS_SEMANTICS')
    horizontal=chart['type']=='bar' and chart['direction']=='bar'
    positions=['l','b'] if horizontal else ['b','l']
    all_values=[Decimal(x) for s in chart['series'] for x in s['decimals']]
    for index,ax in enumerate([cat,value]):
        require(val(ax,'c:axPos')==positions[index] and val(ax,'c:crossAx')==ids[1-index],'CHART_AXIS_SEMANTICS')
        require(not ax.findall('c:crosses',NS) and not ax.findall('c:crossesAt',NS),'CHART_AXIS_SEMANTICS')
        scaling=one(ax,'c:scaling','CHART_AXIS_SEMANTICS')
        require(not scaling.attrib and val(scaling,'c:orientation')=='minMax','CHART_AXIS_SEMANTICS')
        allowed=['orientation'] if index==0 else ['orientation','min','max']
        require(all(n.tag in {'{'+NS['c']+'}'+t for t in allowed} for n in scaling),'CHART_AXIS_SEMANTICS')
        require(len(scaling.findall('c:orientation',NS))==1,'CHART_AXIS_SEMANTICS')
        bounds={}
        for kind in ['min','max']:
            found=scaling.findall('c:'+kind,NS)
            require(len(found)<=1,'CHART_AXIS_BOUNDS')
            if found:
                raw=found[0].get('val','')
                require(re.fullmatch(r'[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?',raw) is not None and len(raw)<=128,'CHART_AXIS_BOUNDS')
                number=Decimal(raw);require(number.is_finite(),'CHART_AXIS_BOUNDS');bounds[kind]=number
        require(not ('min' in bounds and 'max' in bounds) or bounds['min']<bounds['max'],'CHART_AXIS_BOUNDS')
        for number in all_values+([Decimal(0)] if chart['type']=='bar' else []):
            require(('min' not in bounds or bounds['min']<=number) and ('max' not in bounds or number<=bounds['max']),'CHART_AXIS_BOUNDS')
    return value,cat
def workbook(z,name):
    data=z.read(name);w=archive(data)
    for n in w.namelist():
        if n.endswith('.rels'):
            # Validate every workbook relationship, including unused external links.
            owner='' if n=='_rels/.rels' else posixpath.join(posixpath.dirname(posixpath.dirname(n)),posixpath.basename(n)[:-5])
            relationships(w,owner)
    book=xml(w,'xl/workbook.xml');rels=relationships(w,'xl/workbook.xml');strings=[]
    if 'xl/sharedStrings.xml' in w.namelist():strings=[txt(si,'.//s:t') for si in xml(w,'xl/sharedStrings.xml').findall('s:si',NS)]
    sheets={}
    for s in book.findall('s:sheets/s:sheet',NS):
        rid=s.get(R+'id');require(rid in rels and s.get('state','visible')=='visible','CHART_WORKBOOK_REL');cells={}
        sheetroot=xml(w,rels[rid][0])
        for dimension in sheetroot.findall('.//s:row',NS)+sheetroot.findall('.//s:col',NS):
            require(not xsd_boolean(dimension.get('hidden','false')),'CHART_WORKBOOK_HIDDEN')
        for c in sheetroot.findall('.//s:sheetData/s:row/s:c',NS):
            address=c.get('r');require(address and address not in cells,'CHART_WORKBOOK_CELL')
            require(c.find('s:f',NS) is None,'CHART_WORKBOOK_FORMULA')
            typ=c.get('t','n');v=c.find('s:v',NS)
            if typ=='inlineStr':value=txt(c,'s:is//s:t');numeric=False
            elif typ=='s':
                require(v is not None and re.fullmatch(r'[0-9]+',v.text or '') is not None and len(v.text)<=10,'CHART_WORKBOOK_STRING')
                index=int(v.text);require(0<=index<len(strings),'CHART_WORKBOOK_STRING');value=strings[index];numeric=False
            else:
                require(typ=='n' and v is not None,'CHART_WORKBOOK_CELL_TYPE');value=v.text;numeric=True
            cells[address]=(value,numeric)
        require(s.get('name') not in sheets,'CHART_WORKBOOK_SHEET');sheets[s.get('name')]=cells
    return data,sheets
RANGE=re.compile(r"^(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_ ]*))!\$([A-Z]{1,3})\$([1-9][0-9]{0,5}):\$([A-Z]{1,3})\$([1-9][0-9]{0,5})$")
def ranged_values(formula,sheets,expected,numeric):
    m=RANGE.fullmatch(formula or '');require(m is not None,'CHART_RANGE')
    sheet=(m[1] or m[2]).replace("''", "'");c1,r1,c2,r2=m[3],int(m[4]),m[5],int(m[6]);require(sheet in sheets and c1==c2 and r2>=r1 and r2-r1+1==len(expected),'CHART_RANGE')
    actual=[];mapping=[]
    for row,e in zip(range(r1,r2+1),expected):
        addr=f'{c1}{row}';require(addr in sheets[sheet],'CHART_WORKBOOK_CELL_MISSING',addr);v,isnum=sheets[sheet][addr]
        if numeric:require(isnum and Decimal(v)==Decimal(e),'CHART_WORKBOOK_VALUE_SOURCE',addr)
        else:require(v==e,'CHART_WORKBOOK_CATEGORY_SOURCE',addr)
        actual.append(v);mapping.append({'sheet':sheet,'cell':addr,'value':v,'numeric':isnum})
    return mapping

def font(node,family,size):
    require(node is not None,'CHART_FONT')
    props=node.findall('.//a:rPr',NS)+node.findall('.//a:defRPr',NS);require(bool(props),'CHART_FONT')
    sizes=[p.get('sz') for p in props if p.get('sz')]
    require(sizes and all(int(x)==round(size*75) for x in sizes),'CHART_FONT_SIZE')
    for p in props:
        for script in ['latin','ea','cs']:require(one(p,'a:'+script,'CHART_FONT').get('typeface')==family,'CHART_FONT')

def _verify(package,expected,manifest,program=None,strict_roots=False):
    if program is None: require(manifest.get('schema')=='native-chart-package-manifest-v1' and manifest.get('catalogDigest')==expected['catalogDigest'] and manifest.get('sourcesDigest')==expected['sourcesDigest'],'CHART_SOURCE_MANIFEST')
    require(os.stat(package).st_size<=32*1024*1024,'CHART_ZIP_BOUND');data=open(package,'rb').read(32*1024*1024+1);z=archive(data)
    # No external or dangling relationship anywhere, not just on selected charts.
    for n in z.namelist():
        if n.endswith('.rels'):
            owner='' if n=='_rels/.rels' else posixpath.join(posixpath.dirname(posixpath.dirname(n)),posixpath.basename(n)[:-5]);relationships(z,owner)
    charts={c['chartId']:c for c in expected['charts']} if program is None else None;occ=manifest['occurrences'];require((bool(occ) or program is not None) and len({o['placement']['name'] for o in occ})==len(occ),'CHART_OCCURRENCE')
    found={};chartparts=set();workbookparts=set();proof=[];metadata_owners={};seen_metadata=set()
    if program is not None:
        for row in program['occurrences']:
            for meta in row['metadata']:
                require(meta['elementId'] not in metadata_owners,'CHART_METADATA_UNION');metadata_owners[meta['elementId']]=row['placement']['slideNumber']
    # Resolve actual presentation slide order, never assume slide filenames define numbering.
    pres=xml(z,'ppt/presentation.xml');presrels=relationships(z,'ppt/presentation.xml')
    slides=[presrels[s.get(R+'id')][0] for s in pres.findall('p:sldIdLst/p:sldId',NS)]
    for number,part in enumerate(slides,1):
        root=xml(z,part);rels=relationships(z,part)
        identities=root.findall('.//p:cNvPr',NS);ids=[n.get('id') for n in identities];names=[n.get('name') for n in identities if n.get('name')];require(len(set(ids))==len(ids) and all(re.fullmatch(r'[1-9][0-9]*',x or '') for x in ids) and len(set(names))==len(names),'CHART_NATIVE_IDENTITY')
        require(not root.findall('.//p:grpSp',NS),'CHART_UNSUPPORTED_CONTAINER')
        if program is not None:
            for shape in one(root,'p:cSld/p:spTree').findall('p:sp',NS):
                metadata_name=one(shape,'p:nvSpPr/p:cNvPr').get('name')
                if metadata_name in metadata_owners:
                    require(metadata_name not in seen_metadata and metadata_owners[metadata_name]==number,'CHART_METADATA_UNION');seen_metadata.add(metadata_name)
        for frame in root.findall('.//p:graphicFrame',NS):
            graphic=one(frame,'a:graphic/a:graphicData');require(graphic.get('uri')==NS['c'],'CHART_UNSUPPORTED_CONTAINER')
            nv=one(frame,'p:nvGraphicFramePr/p:cNvPr');require(nv.get('hidden','0') in ('0','false') and not one(frame,'p:xfrm').attrib,'CHART_FRAME_HIDDEN');name=nv.get('name');matches=[o for o in occ if o['placement']['name']==name and o['placement']['slideNumber']==number]
            require(len(matches)==1 and name not in found,'CHART_NATIVE_FRAME');o=matches[0];found[name]=True;c=charts.get(o['chartId']) if program is None else o['expectedChart']
            require(c and c['dataHash']==o['dataHash'] and (program is not None or o['catalogDigest']==expected['catalogDigest']),'CHART_SOURCE_MANIFEST')
            off=one(frame,'p:xfrm/a:off');ext=one(frame,'p:xfrm/a:ext');p=o['placement']
            require([int(off.get('x')),int(off.get('y')),int(ext.get('cx')),int(ext.get('cy'))]==[round(p[k]*9525) for k in ['left','top','width','height']],'CHART_GEOMETRY')
            rid=one(graphic,'c:chart').get(R+'id');require(rid in rels and rels[rid][1].endswith('/chart'),'CHART_NATIVE_REL');chartpart=rels[rid][0];require(chartpart not in chartparts,'CHART_SHARED_PART');chartparts.add(chartpart)
            ch=xml(z,chartpart);chart=one(ch,'c:chart');require(val(chart,'c:plotVisOnly')=='1','CHART_HIDDEN_LAYOUT');plot=one(chart,'c:plotArea');family='barChart' if c['type']=='bar' else 'lineChart';native=one(plot,'c:'+family,'CHART_TYPE')
            if program is not None and program.get('textPolicy')==PARAGRAPH_TEXT_POLICY:
                surface=one(ch,'c:spPr/a:solidFill/a:srgbClr','CHART_SURFACE')
                require(surface.attrib=={'val':'FFFFFF'} and len(surface)==0,'CHART_SURFACE')
            require(len([x for x in plot if x.tag.endswith('Chart')])==1,'CHART_TYPE')
            if c['type']=='bar':require(val(native,'c:barDir')==('col' if c['direction']=='column' else 'bar') and val(native,'c:grouping')=='clustered','CHART_TYPE')
            else:require(val(native,'c:grouping')=='standard','CHART_TYPE')
            require(txt(chart,'c:title//a:t')==c['title'],'CHART_TITLE')
            axis,catAxis=axis_semantics(plot,native,c)
            require(txt(axis,'c:title//a:t')==c['unit'],'CHART_UNIT')
            for ax in [axis,catAxis]:require(val(ax,'c:delete')=='0' and (ax.find('c:tickLblPos',NS) is None or val(ax,'c:tickLblPos')!='none'),'CHART_AXIS_HIDDEN')
            require(one(axis,'c:numFmt').get('formatCode')==c['numberFormat'],'CHART_FORMAT')
            labels=one(native,'c:dLbls');require(val(labels,'c:showVal')=='1' and one(labels,'c:numFmt').get('formatCode')==c['numberFormat'] and not native.findall('c:ser/c:dLbls',NS) and not labels.findall('c:dLbl',NS),'CHART_LABELS')
            require(labels.find('c:delete',NS) is None or val(labels,'c:delete')=='0','CHART_LABELS')
            require(not ch.findall('.//c:manualLayout',NS) and not ch.findall('.//c:legendEntry',NS),'CHART_HIDDEN_LAYOUT')
            b=o['brand'];font(one(chart,'c:title'),b['fontFamily'],b['titleSize']);font(one(axis,'c:txPr'),b['fontFamily'],b['axisSize']);font(one(catAxis,'c:txPr'),b['fontFamily'],b['axisSize']);font(one(axis,'c:title'),b['fontFamily'],b['axisSize']);font(one(chart,'c:legend'),b['fontFamily'],b['legendSize']);font(one(labels,'c:txPr'),b['fontFamily'],b['labelSize'])
            external=one(ch,'c:externalData','CHART_WORKBOOK_MISSING');cr=relationships(z,chartpart);wrid=external.get(R+'id');require(wrid in cr and cr[wrid][1].endswith('/package'),'CHART_WORKBOOK_MISSING');wp=cr[wrid][0];require(wp.endswith('.xlsx') and wp not in workbookparts,'CHART_WORKBOOK_MISSING');workbookparts.add(wp);wb,sheets=workbook(z,wp)
            if program is not None: strict_workbook(z,wp,sheets,c)
            series=native.findall('c:ser',NS);require(len(series)==len(c['series']),'CHART_SERIES_COUNT');mappings=[]
            for i,(s,original) in enumerate(zip(series,c['series'])):
                require(val(s,'c:idx')==str(i) and val(s,'c:order')==str(i),'CHART_SERIES_ORDER');require(txt(s,'c:tx/c:v')==original['name'],'CHART_SERIES_NAME')
                ref,cache=reference(one(s,'c:cat'),['strRef','numRef']);points(cache,[x['label'] for x in c['categories']]);require(one(ref,'c:f').text==f"'Chart Data'!${colname(i*2+1)}$2:${colname(i*2+1)}${len(c['categories'])+1}",'CHART_RANGE');catmap=ranged_values(one(ref,'c:f').text,sheets,[x['label'] for x in c['categories']],False)
                vref,cache=reference(one(s,'c:val','CHART_RANGE'),['numRef']);require(one(cache,'c:formatCode').text==c['numberFormat'],'CHART_FORMAT');points(cache,original['decimals'],True);require(one(vref,'c:f').text==f"'Chart Data'!${colname(i*2+2)}$2:${colname(i*2+2)}${len(c['categories'])+1}",'CHART_RANGE');valuemap=ranged_values(one(vref,'c:f').text,sheets,original['decimals'],True)
                # Snapshot workbook headers must retain series names, independently of chart tx.
                formula=one(vref,'c:f').text;rm=RANGE.fullmatch(formula);sheet=(rm[1] or rm[2]).replace("''", "'");header=rm[3]+'1';require(sheets[sheet].get(header,(None,))[0]==original['name'],'CHART_WORKBOOK_SERIES_NAME')
                mappings.append({'seriesId':original['seriesId'],'categoryRange':one(ref,'c:f').text,'valueRange':formula,'categories':catmap,'values':valuemap})
            proof.append({'chartId':c['chartId'],'dataHash':c['dataHash'],'slideNumber':number,'name':name,'chartPart':chartpart,'chartHash':sha(z.read(chartpart)),'workbookPart':wp,'workbookHash':sha(wb),'mapping':mappings})
            if program is not None:proof[-1].update({'slidePart':part,'nativeShapeId':nv.get('id'),'metadata':inspect_metadata(root,o['row'],program.get('textPolicy'))})
    require(len(found)==len(occ),'CHART_NATIVE_MISSING')
    actualparts={n for n in z.namelist() if re.search(r'/charts/[^/]+\.xml$',n)};require(strict_roots or actualparts==chartparts,'CHART_UNDECLARED_PART')
    if program is not None: require(seen_metadata==set(metadata_owners),'CHART_METADATA_UNION')
    if strict_roots: inspect_chart_roots(z,chartparts)
    if program is not None: return finish_v2(z,data,program,proof,chartparts,workbookparts,slides)
    return {'schema':'native-chart-package-proof-v1','status':'passed','packageHash':sha(data),'catalogDigest':expected['catalogDigest'],'sourcesDigest':expected['sourcesDigest'],'charts':proof,'nativeApplicationEditVerified':False,'renderVerifiedByThisInspector':False}

def verify(package,expected,manifest):
    return _verify(package,expected,manifest)

def closed(value,keys,code='CHART_V2_SCHEMA'):
    require(isinstance(value,dict) and set(value)==set(keys.split()),code)

def strict_workbook(z,name,sheets,chart):
    require(set(sheets)=={'Chart Data'},'CHART_WORKBOOK_SHEET_UNION')
    expected={}
    for i,series in enumerate(chart['series']):
        a,b=colname(i*2+1),colname(i*2+2)
        expected[a+'1']=('Category',False);expected[b+'1']=(series['name'],False)
        for row,(category,value) in enumerate(zip(chart['categories'],series['decimals']),2):
            expected[a+str(row)]=(category['label'],False);expected[b+str(row)]=(value,True)
    actual=sheets['Chart Data'];require(set(actual)==set(expected),'CHART_WORKBOOK_CELL_UNION')
    for address,(value,numeric) in expected.items():
        v,isnum=actual[address]
        require(isnum==numeric and (Decimal(v)==Decimal(value) if numeric else v==value),'CHART_WORKBOOK_LITERAL_SOURCE',address)
    w=archive(z.read(name))
    require(set(w.namelist())=={'[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/worksheets/sheet1.xml'},'CHART_WORKBOOK_PART_UNION')
    require(relationships(w,'xl/workbook.xml')=={'rId1':('xl/worksheets/sheet1.xml',NS['r']+'/worksheet')} and relationships(w,'')=={'rId1':('xl/workbook.xml',NS['r']+'/officeDocument')},'CHART_WORKBOOK_REL_UNION')
    types=xml(w,'[Content_Types].xml');actual_types={(item.tag.rsplit('}',1)[-1],item.get('PartName') or item.get('Extension')):item.get('ContentType') for item in types}
    require(len(actual_types)==len(types) and actual_types=={('Default','rels'):'application/vnd.openxmlformats-package.relationships+xml',('Default','xml'):'application/xml',('Override','/xl/workbook.xml'):'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',('Override','/xl/worksheets/sheet1.xml'):'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'},'CHART_WORKBOOK_CONTENT_TYPES')

def metadata_text(shape):
    paragraphs=[]
    for paragraph in one(shape,'p:txBody').findall('a:p',NS):
        parts=[]
        for child in paragraph:
            if child.tag=='{'+NS['a']+'}br':parts.append('\n')
            elif child.tag=='{'+NS['a']+'}r':parts.append(txt(child,'a:t'))
            else: require(child.tag in {'{'+NS['a']+'}pPr','{'+NS['a']+'}endParaRPr'},'CHART_METADATA_TEXT')
        paragraphs.append(''.join(parts))
    return '\n'.join(paragraphs)

TEXT_POLICY='chart-metadata-lf-v1'
PARAGRAPH_TEXT_POLICY='chart-metadata-lf-v2'
TEXT_POLICIES={TEXT_POLICY,PARAGRAPH_TEXT_POLICY}

def metadata_display(source_text,wrap_breaks):
    source=source_text.encode('utf-16-le');units=[int.from_bytes(source[i:i+2],'little') for i in range(0,len(source),2)]
    breaks=set(wrap_breaks);segments=[];parts=[];display_end=0;start=0
    for end in wrap_breaks:
        require(type(end) is int and 0<end<len(units),'CHART_METADATA_WRAP')
        require(not (units[end-1]==13 and units[end]==10) and not (0xd800<=units[end-1]<=0xdbff and 0xdc00<=units[end]<=0xdfff),'CHART_METADATA_WRAP')
    def append(kind,begin,end,text):
        nonlocal display_end
        length=len(text.encode('utf-16-le'))//2
        segments.append({'kind':kind,'sourceStart':begin,'sourceEnd':end,'displayStart':display_end,'displayEnd':display_end+length})
        parts.append(text);display_end+=length
    while start<len(units):
        if start in breaks:append('wrap',start,start,'\n')
        begin=start
        if units[start] in (10,13):
            start+=2 if units[start]==13 and start+1<len(units) and units[start+1]==10 else 1
            append('source-newline',begin,start,'\n')
        else:
            start+=1
            while start<len(units) and start not in breaks and units[start] not in (10,13):start+=1
            append('copy',begin,start,source[begin*2:start*2].decode('utf-16-le'))
    return ''.join(parts),segments

def metadata_format(body,meta,display_text,text_policy):
    def node(name,attributes=None,children=(),text=''):
        return ('{'+NS['a']+'}'+name,attributes or {},text,'',tuple(children))
    def actual(element):
        return (element.tag,element.attrib,element.text or '',element.tail or '',tuple(actual(child) for child in element))
    def run_properties(name):
        return node(name,{'sz':str(round(meta['fontSize']*75)),'b':'0'},[
            node('solidFill',children=[node('srgbClr',{'val':meta['fontColor'].lstrip('#').upper()})]),
            *[node(script,{'typeface':meta['fontFamily']}) for script in ['latin','ea','cs']],
        ])
    body_properties=node('bodyPr',{'wrap':'none','lIns':'0','tIns':'0','rIns':'0','bIns':'0','anchor':'t'},[node('noAutofit')])
    list_style=node('lstStyle',children=[node(level,{'algn':'l'},[run_properties('defRPr')]) for level in ['defPPr',*[f'lvl{i}pPr' for i in range(1,10)]]])
    paragraph_properties=node('pPr',{'algn':'l'},[
        node('lnSpc',children=[node('spcPct',{'val':'115000'})]),node('buNone'),run_properties('defRPr'),
    ])
    blank_properties=node('pPr',children=[node('lnSpc',children=[node('spcPct',{'val':'115000'})]),node('buNone')])
    paragraphs=[node('p',children=([blank_properties] if text_policy==PARAGRAPH_TEXT_POLICY else [])+[node('r',children=[node('t')])]) if text_policy in TEXT_POLICIES and line=='' else node('p',children=[paragraph_properties,node('r',children=[run_properties('rPr'),node('t',text=line)])]) for line in display_text.split('\n')]
    expected=('{'+NS['p']+'}txBody',{},'','',(body_properties,list_style,*paragraphs))
    require(actual(body)==expected,'CHART_METADATA_FORMAT')

def inspect_metadata(root,row,text_policy):
    tree=one(root,'p:cSld/p:spTree');local=[]
    for meta in row['metadata']:
        shapes=[shape for shape in tree.findall('p:sp',NS) if one(shape,'p:nvSpPr/p:cNvPr').get('name')==meta['elementId']]
        require(len(shapes)==1,'CHART_METADATA_NATIVE');shape=shapes[0];nv=one(shape,'p:nvSpPr/p:cNvPr')
        require(nv.get('hidden','0') in ('0','false'),'CHART_METADATA_HIDDEN')
        transform=one(shape,'p:spPr/a:xfrm');require(not transform.attrib,'CHART_METADATA_GEOMETRY')
        off=one(transform,'a:off');ext=one(transform,'a:ext');g=meta['geometry'];geometry=[int(off.get('x')),int(off.get('y')),int(ext.get('cx')),int(ext.get('cy'))]
        require(geometry==[round(g[k]*9525) for k in ['left','top','width','height']],'CHART_METADATA_GEOMETRY')
        display,segments=metadata_display(meta['sourceText'],meta['wrapBreaks']) if text_policy in TEXT_POLICIES else (meta['text'],None)
        actual=metadata_text(shape);require(actual==display,'CHART_METADATA_TEXT')
        require(meta['fontSize']>=16,'CHART_METADATA_FONT_SIZE');body=one(shape,'p:txBody/a:bodyPr');require(body.get('rot','0')=='0' and body.get('vert','horz')=='horz' and not body.findall('a:normAutofit',NS) and not body.findall('a:spAutoFit',NS) and all(a.get('val')=='100000' for a in shape.findall('p:txBody//a:alpha',NS)),'CHART_METADATA_HIDDEN');font(one(shape,'p:txBody'),meta['fontFamily'],meta['fontSize'])
        require(body.attrib=={'wrap':'none','lIns':'0','tIns':'0','rIns':'0','bIns':'0','anchor':'t'} and len(body)==1 and body[0].tag=='{'+NS['a']+'}noAutofit','CHART_METADATA_HIDDEN')
        for prop in shape.findall('p:txBody//a:rPr',NS)+shape.findall('p:txBody//a:defRPr',NS):
            require(prop.attrib=={'sz':str(round(meta['fontSize']*75)),'b':'0'},'CHART_METADATA_FONT')
            require([child.tag for child in prop]==['{'+NS['a']+'}'+name for name in ['solidFill','latin','ea','cs']],'CHART_METADATA_COLOR')
            color=one(prop,'a:solidFill/a:srgbClr','CHART_METADATA_COLOR')
            require(color.attrib=={'val':meta['fontColor'].lstrip('#').upper()} and not len(color),'CHART_METADATA_COLOR')
        for index,paragraph in enumerate(shape.findall('p:txBody/a:p',NS)):
            if text_policy in TEXT_POLICIES and index<len(display.split('\n')) and display.split('\n')[index]=='':continue
            props=one(paragraph,'a:pPr','CHART_METADATA_TEXT')
            require(props.attrib=={'algn':'l'} and one(props,'a:lnSpc/a:spcPct').get('val')=='115000' and len(props.findall('a:buNone',NS))==1,'CHART_METADATA_TEXT')
        metadata_format(one(shape,'p:txBody'),meta,display,text_policy)
        text_proof={'textHash':sha(actual.encode())} if text_policy is None else {'measuredTextHash':sha(meta['text'].encode()),'displayTextHash':sha(actual.encode()),'displayMapping':segments,'mappingHash':program_hash({'textPolicy':text_policy,'segments':segments})}
        local.append({'elementId':meta['elementId'],'elementOccurrenceId':meta['elementOccurrenceId'],'nativeShapeId':nv.get('id'),**text_proof,'sourceTextHash':sha(meta['sourceText'].encode()),'geometryEmu':geometry,'contentRefs':meta['contentRefs']})
    return local

def finish_v2(z,data,program,proof,chartparts,workbookparts,slides):
    require(len(slides)==program['slideCount'],'CHART_V2_SLIDE_COUNT')
    size=one(xml(z,'ppt/presentation.xml'),'p:sldSz')
    require([int(size.get(k)) for k in ['cx','cy']]==[round(program['slideSize'][k]*9525) for k in ['width','height']],'CHART_V2_SLIDE_SIZE')
    ct=xml(z,'[Content_Types].xml');defaults={};overrides={}
    for item in ct:
        key=item.get('PartName') if item.tag.endswith('Override') else item.get('Extension')
        table=overrides if item.tag.endswith('Override') else defaults
        require(key not in table,'CHART_CONTENT_TYPE_UNION');table[key]=item.get('ContentType','')
    typed=set();typed_charts=set();typed_slides=set();actual_slides=set()
    require(all(part.startswith('/') and part[1:] in z.namelist() for part in overrides),'CHART_CONTENT_TYPE_UNION')
    for name in z.namelist():
        kind=overrides.get('/'+name,defaults.get(name.rsplit('.',1)[-1],''))
        if kind=='application/vnd.openxmlformats-officedocument.drawingml.chart+xml':typed_charts.add(name)
        if kind=='application/vnd.openxmlformats-officedocument.presentationml.slide+xml':typed_slides.add(name)
        if name in chartparts:require(kind=='application/vnd.openxmlformats-officedocument.drawingml.chart+xml','CHART_CONTENT_TYPE_UNION')
        if 'spreadsheet' in kind or name.lower().endswith(('.xlsx','.xlsm','.xlsb','.xls')) or '/embeddings/' in name:
            require(kind=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and re.fullmatch(r'ppt/embeddings/[^/]+\.xlsx',name),'CHART_WORKBOOK_PACKAGE_TYPE',name);typed.add(name)
        payload=z.read(name)
        if len(payload)>=4 and not name.endswith('/') and zipfile.is_zipfile(io.BytesIO(payload)):
            require(name in workbookparts,'CHART_WORKBOOK_PACKAGE_UNION',name)
        xml_hint=re.match(br'^(?:\xef\xbb\xbf)?[ \t\r\n]*<|^(?:[ \t\r\n]\x00)*<\x00|^(?:\x00[ \t\r\n])*\x00<',payload) or payload.startswith((b'\xff\xfe',b'\xfe\xff',b'\x00\x00\xfe\xff'))
        if name.lower().endswith('.xml') or kind=='application/xml' or kind.endswith('+xml') or xml_hint:
            root=xml(z,name);frames=list(root.iter('{'+NS['p']+'}graphicFrame'))
            if root.tag=='{'+NS['p']+'}sld':actual_slides.add(name)
            if frames:
                require(name in slides and root.tag=='{'+NS['p']+'}sld','CHART_FRAME_PART_UNION',name)
                require(len(frames)==len(one(root,'p:cSld/p:spTree').findall('p:graphicFrame',NS)),'CHART_FRAME_PART_UNION',name)
    require(len(slides)==len(set(slides)) and actual_slides==typed_slides==set(slides),'CHART_SLIDE_PART_UNION')
    presentation=xml(z,'ppt/presentation.xml');presrels=relationships(z,'ppt/presentation.xml');slide_ids=[s.get(R+'id') for s in presentation.findall('p:sldIdLst/p:sldId',NS)]
    require(all(presrels[rid][1]==NS['r']+'/slide' for rid in slide_ids) and {rid for rid,(_,kind) in presrels.items() if kind.endswith('/slide')}==set(slide_ids),'CHART_SLIDE_REL_UNION')
    require(typed_charts==chartparts,'CHART_CONTENT_TYPE_UNION')
    packages=[];chart_targets=[];chart_owners={row['chartPart']:row['slidePart'] for row in proof}
    for name in z.namelist():
        if name.endswith('.rels'):
            owner='' if name=='_rels/.rels' else posixpath.join(posixpath.dirname(posixpath.dirname(name)),posixpath.basename(name)[:-5])
            for target,kind in relationships(z,owner).values():
                if kind.endswith('/chart'):
                    require(kind==NS['r']+'/chart' and chart_owners.get(target)==owner,'CHART_REL_UNION');chart_targets.append(target)
                if kind.endswith('/package'):
                    require(kind==NS['r']+'/package' and owner in chartparts and target in workbookparts,'CHART_WORKBOOK_REL_UNION');packages.append(target)
    require(set(chart_targets)==chartparts and len(chart_targets)==len(chartparts),'CHART_REL_UNION')
    require(typed==workbookparts and set(packages)==workbookparts and len(packages)==len(workbookparts),'CHART_WORKBOOK_PACKAGE_UNION')
    rows=[]
    for row in program['occurrences']:
        p=row['placement'];chartproof=next(q for q in proof if q['name']==p['name'] and q['slideNumber']==p['slideNumber'])
        rows.append({**chartproof,**{k:row[k] for k in ['identity','catalogDigest','sourcesDigest','authoredOccurrenceId','pageIntentId','elementId','elementOccurrenceId']}})
    return {**({'textPolicy':program['textPolicy']} if 'textPolicy' in program else {}),'schema':'native-chart-occurrence-package-proof-v2','status':'passed','packageHash':sha(data),'programHash':program_hash(program),'occurrences':rows,'chartParts':sorted(chartparts),'workbookParts':sorted(workbookparts),'nativeApplicationEditVerified':False,'renderVerifiedByThisInspector':False,'objectCoverageComplete':False,'pdfFontRegionsVerified':False,'nativeExecutionAvailable':False}

def inspect_chart_roots(z,chartparts):
    roots=set()
    for name in z.namelist():
        payload=z.read(name)
        hint=re.match(br'^(?:\xef\xbb\xbf)?[ \t\r\n]*<|^(?:[ \t\r\n]\x00)*<\x00|^(?:\x00[ \t\r\n])*\x00<',payload)
        if name.lower().endswith('.xml') or hint or payload.startswith((b'\xff\xfe',b'\xfe\xff',b'\x00\x00\xfe\xff')):
            if xml(z,name).tag == '{'+NS['c']+'}chartSpace':roots.add(name)
    require(roots==chartparts,'CHART_ROOT_UNION')

def program_hash(program):
    return sha(json.dumps(program,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())

def verify_occurrences(package,program,manifest,strict_roots=False):
    closed(program,'schema sourceHash manuscriptHash style slideCount slideSize occurrences'+(' textPolicy' if 'textPolicy' in program else ''));require('textPolicy' not in program or program['textPolicy'] in TEXT_POLICIES,'CHART_V2_SCHEMA');require(program['schema']=='native-chart-occurrence-program-v2','CHART_V2_SCHEMA')
    closed(program['slideSize'],'width height');require(program['style'] in ('editorial','stage','evidence') and type(program['slideCount']) is int and 1<=program['slideCount']<=128,'CHART_V2_SCHEMA')
    for field in ['sourceHash','manuscriptHash']:require(re.fullmatch('[0-9a-f]{64}',program[field]) is not None,'CHART_V2_SCHEMA')
    closed(manifest,'schema programHash emitted');require(manifest['schema']=='native-chart-occurrence-manifest-v2' and manifest['programHash']==program_hash(program),'CHART_V2_MANIFEST')
    require(isinstance(program['occurrences'],list) and len(program['occurrences'])<=128 and len(manifest['emitted'])==len(program['occurrences']),'CHART_V2_OCCURRENCES')
    names=set();authored=set();occ=[]
    for row,emitted in zip(program['occurrences'],manifest['emitted']):
        closed(row,'identity catalogDigest sourcesDigest authoredOccurrenceId pageIntentId elementId elementOccurrenceId placement brand expectedChart metadata')
        closed(row['expectedChart'],'chartId type direction title unit unitKind period population limitations categories series numberFormat dataHash')
        for category in row['expectedChart']['categories']:closed(category,'categoryId label')
        for series in row['expectedChart']['series']:closed(series,'seriesId name decimals values')
        closed(row['identity'],'artifactId chartId dataHash admissionHash');require(row['expectedChart']['chartId']==row['identity']['chartId'] and row['expectedChart']['dataHash']==row['identity']['dataHash'],'CHART_V2_IDENTITY');closed(row['placement'],'slideNumber name left top width height');closed(row['brand'],'fontFamily titleSize axisSize legendSize labelSize')
        p=row['placement'];require(type(p['slideNumber']) is int and 1<=p['slideNumber']<=program['slideCount'] and all(type(p[k]) in (int,float) and math.isfinite(p[k]) and p[k]>=0 for k in ['left','top','width','height']) and p['width']>0 and p['height']>0,'CHART_GEOMETRY')
        require(all(type(row['brand'][k]) in (int,float) and 16<=row['brand'][k]<=64 for k in ['titleSize','axisSize','legendSize','labelSize']),'CHART_FONT_SIZE')
        require(row['elementId']==row['placement']['name'] and row['elementId'] not in names and row['authoredOccurrenceId'] not in authored,'CHART_V2_OCCURRENCES');names.add(row['elementId']);authored.add(row['authoredOccurrenceId'])
        foundation={**{k:row['identity'][k] for k in ['chartId','dataHash']},'catalogDigest':row['catalogDigest'],'placement':row['placement'],'brand':row['brand']}
        require(emitted=={'elementId':row['elementId'],'authoredOccurrenceId':row['authoredOccurrenceId'],'identity':row['identity'],'foundation':foundation},'CHART_V2_EMITTED')
        for meta in row['metadata']:
            if 'textPolicy' in program:metadata_display(meta['sourceText'],meta['wrapBreaks'])
            breaks=meta['wrapBreaks'];source=meta['sourceText'].encode('utf-16-le');previous=0;chunks=[]
            for end in breaks:
                require(isinstance(end,int) and previous<end<len(source)//2,'CHART_METADATA_WRAP');chunks.append(source[previous*2:end*2].decode('utf-16-le'));previous=end
            chunks.append(source[previous*2:].decode('utf-16-le'));require('\n'.join(chunks)==meta['text'],'CHART_METADATA_WRAP')
            require(meta['contentRefs']['chartOccurrenceId']==row['authoredOccurrenceId'],'CHART_METADATA_SCOPE')
            closed(meta,'elementId elementOccurrenceId text sourceText wrapBreaks contentRefs geometry fontFamily fontSize fontColor')
            closed(meta['geometry'],'left top width height');closed(meta['contentRefs'],'blockIds imageIds sourceIds claimOrigins obligationOrigins chartOccurrenceId chartMetadata')
            require(type(meta['fontSize']) in (int,float) and 16<=meta['fontSize']<=64 and re.fullmatch(r'#[0-9a-fA-F]{6}',meta['fontColor']) is not None,'CHART_V2_SCHEMA')
            for reference in meta['contentRefs']['chartMetadata']:
                closed(reference,'originId blockId start end');require(type(reference['start']) is int and type(reference['end']) is int and 0<=reference['start']<reference['end']<=len(source)//2,'CHART_METADATA_SCOPE')
        occ.append({**foundation,'expectedChart':row['expectedChart'],'row':row})
    return _verify(package,{}, {'occurrences':occ},program,strict_roots)

if __name__=='__main__':
    try:
        require(len(sys.argv)==2,'CHART_USAGE');payload=json.load(sys.stdin);print(json.dumps(verify(sys.argv[1],payload['expected'],payload['manifest']),ensure_ascii=False,indent=2))
    except (ChartPackageError,ValueError,KeyError,ET.ParseError,zipfile.BadZipFile,InvalidOperation,OverflowError,TypeError,IndexError) as e:
        print(json.dumps({'status':'failed','error':str(e)}),file=sys.stderr);sys.exit(1)
