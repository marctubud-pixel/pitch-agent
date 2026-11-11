import importlib.util,io,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
spec=importlib.util.spec_from_file_location('coverage',Path(__file__).with_name('object-coverage.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class Capacity(unittest.TestCase):
 def setUp(self):
  self.checked={'transportVersion':'native-layout-lossless-v1','transport':{'sha256':'a'*64,'bytes':24},'original':{'sha256':'b'*64,'bytes':42}}
  self.report={'schemaVersion':'native-object-coverage-v3','semanticCoverageVersion':'native-object-coverage-v2','layoutTransport':self.checked['transport'],'layoutOriginal':self.checked['original'],'text':'中文😀\n\t"\\','empty':[]}
 def emit(self,r,checked=None):
  stream=io.StringIO();c.emit_numeric(r,self.checked if checked is None else checked,stream);return stream.getvalue()
 def test_exact_and_over(self):
  n=c.COVERAGE_POLICY['completeNumericOutputBytes'];self.report['padding']='';size=len(self.emit(self.report).encode());self.report['padding']='x'*(n-size);self.assertEqual(len(self.emit(self.report).encode()),n)
  self.report['padding']+='x';stream=io.StringIO()
  with self.assertRaises(Exception):c.emit_numeric(self.report,self.checked,stream)
  self.assertEqual(stream.getvalue(),'')
 def test_legacy_bytes(self):
  r={'schemaVersion':'native-object-coverage-v2','text':'中文😀\n\t"\\','empty':[]};self.assertEqual(self.emit(r,{'transportVersion':None}),json.dumps(r,ensure_ascii=False)+'\n')
 def test_tuple(self):
  for key,value in [('schemaVersion','native-object-coverage-v4'),('semanticCoverageVersion',None),('layoutTransport',{}),('layoutOriginal',{})]:
   r={**self.report,key:value};stream=io.StringIO()
   with self.assertRaises(Exception):c.emit_numeric(r,self.checked,stream)
   self.assertEqual(stream.getvalue(),'')
  with self.assertRaises(Exception):self.emit(self.report,{'transportVersion':None})
unittest.main()
