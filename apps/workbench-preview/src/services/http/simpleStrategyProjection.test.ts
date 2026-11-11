import {expect,it} from 'vitest';
import {pendingWriteKind,BriefWriteJournal} from './briefRecovery';
import {pendingWriteAction} from '../../collaboration/types';
class Store implements Storage{values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}clear(){this.values.clear();}}
it('classifies the three strict SIMPLE request paths as workflow commands',()=>{
 for(const operation of ['continue','verify','reconcile'])expect(pendingWriteAction(pendingWriteKind(`/projects/p/simple-strategy/${operation}`,{}))).toEqual({kind:'workflow'});
 expect(()=>pendingWriteKind('/projects/p/strategy-v2/continue',{})).toThrow();
});
it('preserves the original fixed job and revision through a new recovery journal',()=>{
 const storage=new Store(),journal=new BriefWriteJournal(()=> 'journal',()=>storage),path='/projects/p/simple-strategy/reconcile',body=JSON.stringify({commandId:'original',expectedRevision:14,jobId:'original-job'});
 journal.begin({kind:'reconcile_simple_strategy',path,body,commandId:'original',label:'核对原策略结果'});
 const restored=new BriefWriteJournal(()=> 'journal',()=>storage);expect(restored.getPending()).toMatchObject({kind:'reconcile_simple_strategy',path,body,commandId:'original'});
 expect(()=>restored.begin({kind:'reconcile_simple_strategy',path,body:JSON.stringify({commandId:'original',expectedRevision:15,jobId:'new-current-job'}),commandId:'original',label:'新任务'})).toThrow();
 expect(restored.getPending()?.body).toBe(body);
});
