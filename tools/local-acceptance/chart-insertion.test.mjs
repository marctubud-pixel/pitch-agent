import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createChartInsertion} from './chart-insertion.mjs';
const data={type:'bar',direction:'column',title:'用户输入',unit:'件',numberFormat:'0',categories:['甲'],series:[{name:'输入',values:[1]}]};
const context=()=>({document:{id:'doc',revision:2,plan:{width:1280,height:720,slides:[{id:'one',elements:[]},{id:'two',elements:[]}]}},head:2,slideId:'one',busy:false,pending:false});
const controller=()=>createChartInsertion({uuid:()=> 'stable'});
test('blank stays blank and no fabricated values are submitted; exact command has fixed target',()=>{
 const c=controller(),ctx=context();c.open(ctx);assert.throws(()=>c.prepare(ctx,''),/填写/);ctx.slideId='two';
 const result=c.prepare(ctx,JSON.stringify(data));assert.equal(result.slideId,'one');assert.deepEqual(Object.keys(result),['kind','slideId','elementId','geometry','data']);assert.deepEqual(result.data,data);
});
test('historical, busy, pending, changed document and removed target cannot insert',()=>{
 for(const override of [{head:3},{busy:true},{pending:true}]){const c=controller(),ctx=context();c.open(ctx);assert.throws(()=>c.prepare({...ctx,...override},JSON.stringify(data)));}
 const c=controller(),ctx=context();c.open(ctx);assert.throws(()=>c.prepare({...ctx,document:{...ctx.document,id:'other'}},JSON.stringify(data)));ctx.document.plan.slides.shift();assert.throws(()=>c.prepare(ctx,JSON.stringify(data)),/删除/);
});
test('validation failure retains insertion identity and rejects provenance injection',()=>{
 const c=controller(),ctx=context();c.open(ctx);assert.throws(()=>c.prepare(ctx,'{'));assert.throws(()=>c.prepare(ctx,JSON.stringify({...data,verified:true})));assert.throws(()=>c.prepare(ctx,JSON.stringify({...data,series:[{name:'坏矩阵',values:[]}]})));
 assert.equal(c.prepare(ctx,JSON.stringify(data)).elementId,'chart-stable');
});
test('reconciled chart is recognized only on bound document and slide',()=>{
 const c=controller(),ctx=context();c.open(ctx);assert.equal(c.reconciled(ctx.document),false);ctx.document.plan.slides[0].elements.push({id:'chart-stable',type:'chart'});assert.equal(c.reconciled({...ctx.document,id:'other'}),false);assert.equal(c.reconciled(ctx.document),true);assert.throws(()=>c.prepare(ctx,JSON.stringify(data)),/文档/);
});
const source=await fs.readFile(new URL('./client.js',import.meta.url),'utf8');
const commitSource=source.slice(source.indexOf('async function commit('),source.indexOf('\nasync function open('));
function commitHarness({reject=false,historyReject=false}={}){
 const original={id:'doc',revision:2,plan:{slides:[{id:'one',elements:[]}]}};
 const state={document:original,head:2,index:0,pendingOperations:[],pending:[{slideId:'one',elementId:'title',values:{text:'未保存文字'}}]};let request,acknowledged=false;
 const saved={...structuredClone(original),revision:3};
 const ctx=vm.createContext({state,editable:()=>true,path:()=>'/api/documents/doc/save',crypto:{randomUUID:()=> 'command'},api:async(path,body)=>{request=body;if(reject)throw Error('response lost');return saved;},render:()=>{},history:async()=>{if(historyReject)throw Error('history failed');}});
 vm.runInContext(commitSource+'\nthis.commit=commit;',ctx);
 return {state,saved,run:extra=>ctx.commit(extra,()=>{acknowledged=true;}),request:()=>request,acknowledged:()=>acknowledged};
}
test('actual client commit batches unsaved edits and insertion then clears only after success',async()=>{
 const h=commitHarness();await h.run([{kind:'add-chart'}]);assert.equal(h.request().changes.length,2);assert.equal(h.request().changes[0].values.text,'未保存文字');assert.equal(h.state.pending.length,0);assert.equal(h.state.head,3);assert.equal(h.acknowledged(),true);
});
test('actual client failed POST preserves local edits and does not clear insertion form',async()=>{
 const h=commitHarness({reject:true});await assert.rejects(h.run([{kind:'add-chart'}]),/lost/);assert.equal(h.state.pending.length,1);assert.equal(h.state.head,2);assert.equal(h.acknowledged(),false);
});
test('actual client history-refresh failure keeps committed revision and closes completed insertion',async()=>{
 const h=commitHarness({historyReject:true});await assert.rejects(h.run([{kind:'add-chart'}]),/history/);assert.equal(h.state.head,3);assert.equal(h.state.pending.length,0);assert.equal(h.acknowledged(),true);
});
test('explicit discard releases removed or changed target but cannot abandon unknown intent',()=>{
 const c=controller(),ctx=context();c.open(ctx);ctx.document.plan.slides.shift();
 for(const overrides of [{pending:true},{busy:true}])assert.throws(()=>c.discard({...ctx,...overrides}),/不能放弃/);
 assert.throws(()=>c.prepare(ctx,JSON.stringify(data)),/删除/);
 c.discard(ctx);ctx.slideId='two';assert.equal(c.open(ctx).slideId,'two');
 c.discard({...ctx,document:{...ctx.document,id:'different'},head:9});assert.equal(c.open({...context(),document:{...context().document,id:'different'}}).documentId,'different');
});
test('all manual label positions reject backend-invalid Unicode, controls and length before dispatch',()=>{
 for(const value of ['a'.repeat(2001),'bad\u0000','bad\ud800','bad\u001f'])for(const field of ['title','unit','category','series']){
  const d=structuredClone(data);if(field==='category')d.categories[0]=value;else if(field==='series')d.series[0].name=value;else d[field]=value;
  const c=controller(),ctx=context();c.open(ctx);assert.throws(()=>c.prepare(ctx,JSON.stringify(d)));
 }
 const c=controller(),ctx=context();c.open(ctx);assert.equal(c.prepare(ctx,JSON.stringify({...data,title:'好'.repeat(2000)+'',unit:'件\t\n'})).data.title.length,2000);
});
test('lost save response locks actual property/page mutations until real journal receipt reconciliation',async()=>{
 const {createBrowserPending,createPendingApi}=await import(pathToFileURL(process.cwd()+'/tools/local-acceptance/browser-pending.mjs'));
 const storage=new Map(),journal=createBrowserPending({origin:'http://127.0.0.1:4400',storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},crypto:webcrypto,withLock:async(name,fn)=>fn()});
 const state={document:{id:'doc',revision:2,plan:{slides:[{id:'one',elements:[{id:'title',type:'text',text:'saved input'}]}]}},head:2,index:0,selected:'title',busy:false,pending:[{slideId:'one',elementId:'title',values:{text:'saved input'}}],pendingOperations:[]};
 let committed,postCount=0,opened=0;
 const pendingApi=createPendingApi({journal,onPending:rows=>{state.pendingOperations=rows;},request:async(path,body)=>{
  if(body){postCount++;committed=structuredClone(body);throw Error('response lost after commit');}
  return {protocol:'editable-command-receipt-v1',status:'committed',id:'doc',commandId:committed.commandId,operation:'save',requestDigest:await journal.digest(committed),documentHash:'a'.repeat(64),revision:3};
 }});
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};
 const ctx=vm.createContext({state,pendingApi,$,crypto:{randomUUID:()=> 'command'},editable:()=>state.document.revision===state.head,slide:()=>state.document.plan.slides[state.index],clone:structuredClone,path:()=>'/api/documents/doc/save',api:pendingApi.api,render:()=>{},renderStage:()=>{},controls:()=>{},history:async()=>{},chartInsertion:{reconciled:()=>false},refreshFlow:async()=>{},action:async fn=>fn(),open:async id=>{assert.equal(id,'doc');opened++;state.head=3;state.document.revision=3;state.pending=[];}});
 const queueSource=source.slice(source.indexOf('function queue('),source.indexOf('\nasync function commit('));
 const pageSource=source.slice(source.indexOf('function pageChange('),source.indexOf("\n$('save').onclick"));
 const reconcileSource=source.slice(source.indexOf("$('reconcile-pending').onclick="),source.indexOf('\nasync function start('));
 vm.runInContext(queueSource+'\n'+commitSource+'\n'+pageSource+'\n'+reconcileSource+'\nthis.queue=queue;this.commit=commit;this.pageChange=pageChange;',ctx);
 await assert.rejects(ctx.commit([{kind:'add-chart'}]),/lost/);
 assert.equal(state.pendingOperations.length,1);assert.equal(state.pending.length,1);
 ctx.queue({text:'must not be silently lost'});ctx.pageChange([{kind:'delete-slide',slideId:'one'}]);
 await assert.rejects(ctx.commit([{kind:'add-chart'}]),/未决/);
 assert.equal(state.document.plan.slides[0].elements[0].text,'saved input');assert.equal(state.pending.length,1);assert.equal(postCount,1);
 await $('reconcile-pending').onclick();
 assert.equal(journal.list().length,0);assert.equal(opened,1);assert.equal(state.head,3);assert.equal(state.pending.length,0);assert.equal(committed.changes[0].values.text,'saved input');assert.equal(postCount,1);
});
