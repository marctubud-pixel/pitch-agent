import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../store.mjs';
import {openReferenceAdmission} from '../local-reference-admission.mjs';
process.on('message',({workflow,native,lease})=>{
 const store=openStore(native),db=new DatabaseSync(workflow),admission=openReferenceAdmission(db,{nativeCommandExists:(id,commandId)=>Object.hasOwn(store.read(id).processedCommands,commandId)});let invoked=false;
 try{admission.execute(lease,invoke=>invoke(()=>{invoked=true;throw Error('late native call must not happen');}));process.send({error:null,invoked});}
 catch(e){process.send({error:e.code??e.message,invoked});}
 finally{db.close();store.close();process.disconnect();}
});
