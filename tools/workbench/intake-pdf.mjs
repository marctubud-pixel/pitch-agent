import {spawn} from 'node:child_process';
import {readFile,realpath,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {isAbsolute} from 'node:path';
import {digest,requireIntake,intakeError} from './intake-document-store.mjs';

export const PDF_LIMITS=Object.freeze({bytes:12*1024*1024,pages:100,textBytes:1024*1024,nodes:100000,outputBytes:4*1024*1024,timeoutMs:20000,memoryBytes:512*1024*1024,cpuSeconds:20});
const scriptPath=fileURLToPath(new URL('./intake-pdf-worker.py',import.meta.url));
export function validateIntakeConfiguration(c){
 requireIntake(c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).every(k=>['pythonBinary','limits'].includes(k)),'INTAKE_CONFIGURATION_INVALID','Only pythonBinary and limits are supported');
 requireIntake(typeof c.pythonBinary==='string'&&isAbsolute(c.pythonBinary),'INTAKE_CONFIGURATION_INVALID','Absolute Python binary required');
 for(const [k,v] of Object.entries(c.limits??{}))requireIntake(Object.hasOwn(PDF_LIMITS,k)&&Number.isSafeInteger(v)&&v>0&&v<=PDF_LIMITS[k],'INTAKE_CONFIGURATION_INVALID','PDF limits must be positive and no larger than policy defaults');
 return [];
}
export function createLocalPdfExtractor(configuration){
 if(configuration)validateIntakeConfiguration(configuration);
 const limits={...PDF_LIMITS,...configuration?.limits};
 async function invoke(bytes,probe,signal){
  requireIntake(configuration,'PDF_EXTRACTOR_UNAVAILABLE','Configure moduleConfigs.intake with an absolute Python binary');
  const binary=await realpath(configuration.pythonBinary);
  const binaryStat=await stat(binary);requireIntake(binaryStat.isFile()&&binaryStat.size<=64*1024*1024,'PDF_EXTRACTOR_UNAVAILABLE','Python executable unavailable');
  const script=await readFile(scriptPath);requireIntake(script.length<65536,'PDF_EXTRACTOR_UNAVAILABLE','Owned PDF worker exceeds code bound');
  const identity={binary, configuredBinary:configuration.pythonBinary,binarySha256:digest(await readFile(binary)),scriptSha256:digest(script)};
  const result=await new Promise((resolveResult,reject)=>{
   const child=spawn(binary,['-I','-B','-c',script.toString('utf8'),JSON.stringify(limits),...(probe?['--probe']:[])],{shell:false,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
   const chunks=[];let size=0,errorBytes=0,reason=null,spawnError=null,exited=false,memorySamples=0,peakObservedRssBytes=0;
   child.once('exit',()=>{exited=true;});
   const stop=why=>{reason??=why;if(!exited)child.kill('SIGKILL');};
   let sample=Promise.resolve(),sampling=false;
   const sampleMemory=()=>{
    if(sampling||!child.pid||exited)return;sampling=true;
    sample=new Promise(done=>{
     let monitor;try{monitor=spawn('/bin/ps',['-o','ppid=','-o','rss=','-p',String(child.pid)],{stdio:['ignore','pipe','ignore']});}catch{stop('memory_monitor_unavailable');done();return;}let out='',failed=false;
     const deadline=setTimeout(()=>{failed=true;monitor.kill('SIGKILL');},500);
     monitor.stdout.on('data',b=>{out+=b.toString();if(out.length>1024){failed=true;monitor.kill('SIGKILL');}});monitor.on('error',()=>{failed=true;});
     monitor.on('close',code=>{clearTimeout(deadline);const [parentPid,rss]=out.trim().split(/\s+/).map(Number);if(!exited){if(failed||code!==0||parentPid!==process.pid||!Number.isFinite(rss)||rss<0)stop('memory_monitor_unavailable');else if(rss>0){memorySamples++;peakObservedRssBytes=Math.max(peakObservedRssBytes,rss*1024);if(rss*1024>limits.memoryBytes)stop('memory_limit');}}done();});
    }).finally(()=>{sampling=false;});
   };
   child.once('spawn',sampleMemory);const memoryTimer=setInterval(sampleMemory,50);
   const timer=setTimeout(()=>stop('timeout'),limits.timeoutMs);
   const abort=()=>stop('cancelled');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   child.stdout.on('data',chunk=>{size+=chunk.length;if(size>limits.outputBytes)stop('output_limit');else chunks.push(chunk);});
   child.stderr.on('data',chunk=>{errorBytes+=chunk.length;if(errorBytes>4096)stop('diagnostic_limit');});
   child.stdin.on('error',()=>{});child.on('error',e=>{spawnError=e;});
   child.on('close',async(code,exitSignal)=>{clearTimeout(timer);clearInterval(memoryTimer);await sample;signal?.removeEventListener('abort',abort);if(spawnError)return reject(intakeError('PDF_EXTRACTOR_UNAVAILABLE','Could not start configured Python'));if(!memorySamples&&!reason)reason='memory_monitor_unavailable';resolveResult({code,exitSignal,reason,memorySamples,peakObservedRssBytes,stdout:Buffer.concat(chunks)});});
   child.stdin.end(bytes??Buffer.alloc(0));
  });
  return {identity,...result};
 }
 return {
  async capability(){try{const r=await invoke(null,true);requireIntake(r.code===0&&!r.reason,'PDF_EXTRACTOR_UNAVAILABLE','Python PDF imports or resource limits unavailable');return {available:true,configured:true,identity:{...r.identity,...JSON.parse(r.stdout)},memoryProtection:{available:true,kind:'owned_child_rss_watchdog',samples:r.memorySamples,peakObservedRssBytes:r.peakObservedRssBytes,hardRssCap:false},limits};}catch(e){return {available:false,configured:!!configuration,reason:e.code??'PDF_EXTRACTOR_UNAVAILABLE',memoryProtection:{available:false,kind:'owned_child_rss_watchdog',hardRssCap:false},limits};}},
  async extract(bytes,{signal}={}){
   requireIntake(Buffer.isBuffer(bytes)&&bytes.length<=limits.bytes,'INPUT_TOO_LARGE','PDF exceeds parser input bound');
   const r=await invoke(bytes,false,signal);requireIntake(r.reason!=='memory_monitor_unavailable','PDF_EXTRACTOR_UNAVAILABLE','Owned-process memory monitoring is unavailable');let parsed;
   if(r.code!==0||r.reason)parsed={status:['timeout','output_limit','diagnostic_limit','memory_limit'].includes(r.reason)?'limit_exceeded':'failed',text:'',textHash:digest(''),pages:[],diagnostics:[r.reason??`process_exit_${r.code}_${r.exitSignal}`],identity:{},limits};
   else {try{parsed=JSON.parse(r.stdout);}catch{throw intakeError('PDF_EXTRACTOR_INVALID','Parser returned invalid JSON');}}
   parsed.memoryProtection={available:r.memorySamples>0&&r.reason!=='memory_monitor_unavailable',kind:'owned_child_rss_watchdog',samples:r.memorySamples,peakObservedRssBytes:r.peakObservedRssBytes,hardRssCap:false};parsed.identity={...r.identity,...parsed.identity};parsed.rawHash=digest(bytes);parsed.protocol='pdf-extraction-v1';
   validatePdfExtraction(parsed);return parsed;
  },
 };
}
export function validatePdfExtraction(x){
 requireIntake(x?.protocol==='pdf-extraction-v1'&&['text_extracted','partial','no_text','password_required','invalid','limit_exceeded','failed'].includes(x.status),'PDF_EXTRACTOR_INVALID','Unsupported PDF result');
 requireIntake(typeof x.text==='string'&&Buffer.byteLength(x.text)<=PDF_LIMITS.textBytes&&digest(x.text)===x.textHash&&Array.isArray(x.pages)&&x.pages.length<=PDF_LIMITS.pages,'PDF_EXTRACTOR_INVALID','Invalid canonical PDF text');
 let start=0;
 for(const [i,p]of x.pages.entries()){
  requireIntake(p.number===i+1&&Number.isFinite(p.width)&&p.width>0&&Number.isFinite(p.height)&&p.height>0&&p.textStartUtf16===start&&p.textEndUtf16===start+p.text.length&&digest(p.text)===p.textHash&&x.text.slice(start,p.textEndUtf16)===p.text,'PDF_EXTRACTOR_INVALID','Invalid page order or UTF16 offsets');
  requireIntake(Array.isArray(p.wordChannel)&&p.wordChannel.every(w=>typeof w.text==='string'&&['x0','top','x1','bottom'].every(k=>Number.isFinite(w[k]))&&w.x0>=0&&w.top>=0&&w.x1>=w.x0&&w.bottom>=w.top&&w.x1<=p.width+0.01&&w.bottom<=p.height+0.01),'PDF_EXTRACTOR_INVALID','Invalid actual word channel');start=p.textEndUtf16+1;
 }
 requireIntake(x.pages.map(p=>p.text).join('\f')===x.text,'PDF_EXTRACTOR_INVALID','Canonical page separator changed');
 return x;
}
