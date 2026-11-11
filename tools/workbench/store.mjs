import {layoutCommandWitness,layoutFingerprintHash,isLayoutCommandWitness} from './layout-command-witness.mjs';
import {isDeepStrictEqual} from 'node:util';
import {trustedTerminalFailureWitness} from './readiness-terminal-failure.mjs';
import {bindSemanticReader,validateSemanticConfiguration,semanticHash} from './semantic-authority.mjs';
import {assistantProjection} from './assistant-projection.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {createProject,applyCommand,DomainError} from './project.mjs';

const MAGIC=Buffer.from([0x57,0x42,0x53,0x53,0x00,0x0d,0x0a,0xff]);
const HEADER_BYTES=84;
export const STORE_SNAPSHOT_BYTES=256*1024*1024;
const MAX_RAW_BYTES=STORE_SNAPSHOT_BYTES;
const MAX_PAYLOAD_BYTES=257*1024*1024;
const MAX_BLOB_BYTES=HEADER_BYTES+MAX_PAYLOAD_BYTES;

function encodeSnapshot(project) {
  const json=JSON.stringify(project);
  if (typeof json!=='string') throw new TypeError('Snapshot serialization did not produce JSON');
  const rawLength=Buffer.byteLength(json,'utf8');
  if (rawLength>MAX_RAW_BYTES) {
    throw Object.assign(new Error('Snapshot exceeds storage capacity'),{code:'SNAPSHOT_ENCODING_LIMIT',status:507});
  }
  const raw=Buffer.from(json,'utf8');
  let payload;
  try {payload=deflateRawSync(raw,{maxOutputLength:MAX_PAYLOAD_BYTES});}
  catch (cause) {
    if (cause.code==='ERR_BUFFER_TOO_LARGE') {
      throw Object.assign(new Error('Snapshot exceeds storage capacity',{cause}),{code:'SNAPSHOT_ENCODING_LIMIT',status:507});
    }
    throw cause;
  }
  if (payload.length>MAX_PAYLOAD_BYTES) {
    throw Object.assign(new Error('Snapshot exceeds storage capacity'),{code:'SNAPSHOT_ENCODING_LIMIT',status:507});
  }
  const header=Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(header);
  header[8]=1;
  header[9]=1;
  header.writeBigUInt64BE(BigInt(rawLength),12);
  createHash('sha256').update(raw).digest().copy(header,20);
  createHash('sha256').update(payload).digest().copy(header,52);
  return Buffer.concat([header,payload]);
}

const readAdmission=new AsyncLocalStorage();
const storeTokens=new WeakMap();
const durableStores=new WeakMap();
export function assertDurableFinalOperationStore(store,committed,expectedFile){const state=durableStores.get(store);if(!state||state.closed||(committed&&state.lastCommit!==committed)||(expectedFile&&state.file!==resolve(expectedFile)))throw Object.assign(Error('FINAL_OPERATION_DURABLE_STORE_REQUIRED'),{code:'FINAL_OPERATION_DURABLE_STORE_REQUIRED'});}
const readError=(code,message)=>Object.assign(new Error(message),{code});
const corrupt=(message,cause)=>Object.assign(new Error(message,{cause}),{code:'SNAPSHOT_CORRUPT'});

function snapshotHeader(header,length) {
  if (!Number.isSafeInteger(length)) throw readError('SNAPSHOT_STORAGE_TYPE','Unsupported snapshot storage type');
  if (length>MAX_BLOB_BYTES) throw corrupt('Snapshot BLOB exceeds format limit');
  if (length<=HEADER_BYTES || !(header instanceof Uint8Array) || header.length<HEADER_BYTES) throw corrupt('Invalid snapshot BLOB length');
  if (!Buffer.from(header.subarray(0,8)).equals(MAGIC)) throw corrupt('Invalid snapshot magic');
  if (header[8]!==1 || header[9]!==1) throw readError('SNAPSHOT_FORMAT_UNSUPPORTED','Unsupported snapshot format');
  if (header[10]!==0 || header[11]!==0) throw corrupt('Invalid snapshot flags');
  const declared=Buffer.from(header.buffer,header.byteOffset,header.byteLength).readBigUInt64BE(12);
  if (declared<1n || declared>BigInt(MAX_RAW_BYTES)) throw corrupt('Invalid snapshot decoded length');
  return Number(declared);
}

function deny(context,code,message) {
  const error=readError(code,message);
  context.failure??=error;
  throw error;
}

export function assertStoreReadAdmission(store,projectId) {
  const context=readAdmission.getStore();
  if (!context) throw readError('SNAPSHOT_READ_ADMISSION_REQUIRED','An active store-owned snapshot read admission is required');
  if (context.closed) deny(context,'SNAPSHOT_READ_SCOPE_CLOSED','Snapshot read admission has closed');
  if (storeTokens.get(store)!==context.token || projectId!==context.projectId) deny(context,'SNAPSHOT_READ_SCOPE_MISMATCH','Snapshot read admission belongs to another store or project');
  if (context.failure) throw context.failure;
}

function forbidEffect() {
  const context=readAdmission.getStore();
  if (context) deny(context,context.closed?'SNAPSHOT_READ_SCOPE_CLOSED':'SNAPSHOT_READ_WRITE_FORBIDDEN','Store effects are forbidden within snapshot read admission');
}

function decodeSnapshot(row) {
  if (row.snapshot_type==='text') {
    if (typeof row.snapshot!=='string') {
      throw Object.assign(new Error('Unexpected snapshot storage mapping'),{code:'SNAPSHOT_STORAGE_TYPE'});
    }
    return JSON.parse(row.snapshot);
  }
  if (row.snapshot_type!=='blob' || !Number.isSafeInteger(row.snapshot_length)) {
    throw Object.assign(new Error('Unsupported snapshot storage type'),{code:'SNAPSHOT_STORAGE_TYPE'});
  }
  if (row.snapshot_length>MAX_BLOB_BYTES) throw corrupt('Snapshot BLOB exceeds format limit');
  const blob=row.snapshot;
  if (!(blob instanceof Uint8Array)) throw readError('SNAPSHOT_STORAGE_TYPE','Unexpected snapshot storage mapping');
  if (blob.length!==row.snapshot_length) throw corrupt('Invalid snapshot BLOB length');
  const declared=snapshotHeader(blob,row.snapshot_length);
  const payload=blob.subarray(HEADER_BYTES);
  if (payload.length>MAX_PAYLOAD_BYTES) throw corrupt('Snapshot payload exceeds format limit');
  if (!createHash('sha256').update(payload).digest().equals(Buffer.from(blob.subarray(52,84)))) {
    throw corrupt('Snapshot payload digest mismatch');
  }
  let inflated;
  try {inflated=inflateRawSync(payload,{info:true,maxOutputLength:Number(declared)});}
  catch (cause) {throw corrupt('Invalid snapshot compression stream',cause);}
  if (inflated.engine.bytesWritten!==payload.length) throw corrupt('Snapshot compression stream has trailing data');
  const raw=inflated.buffer;
  if (raw.length!==Number(declared)) throw corrupt('Snapshot decoded length mismatch');
  if (!createHash('sha256').update(raw).digest().equals(Buffer.from(blob.subarray(20,52)))) {
    throw corrupt('Snapshot decoded digest mismatch');
  }
  let text;
  try {text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);}
  catch (cause) {throw corrupt('Invalid snapshot UTF-8',cause);}
  try {return JSON.parse(text);}
  catch (cause) {throw corrupt('Invalid encoded snapshot JSON',cause);}
}

export function openStore(file) {
  forbidEffect();
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)),{recursive:true});
  const db=new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=FULL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS semantic_configuration (singleton INTEGER PRIMARY KEY CHECK(singleton=1), epoch INTEGER NOT NULL, configuration TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revisions (
      project_id TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL,
      PRIMARY KEY(project_id,revision));
    CREATE TABLE IF NOT EXISTS heads (
      project_id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
      FOREIGN KEY(project_id,revision) REFERENCES revisions(project_id,revision));`);
  const token=Symbol('store');
  let semanticClosed=false;
  const semanticLeases=new WeakMap();
  const semanticConfig=()=>{
    if(semanticClosed)throw new DomainError('SEMANTIC_STORE_CLOSED','Store is closed');
    try {
      const row=db.prepare('SELECT * FROM semantic_configuration WHERE singleton=1').get();
      if(!row)return null;
      const configuration=validateSemanticConfiguration(JSON.parse(row.configuration));
      if(!Number.isSafeInteger(row.epoch)||row.epoch<1||row.hash!==semanticHash(configuration))throw new Error('Invalid persisted authority');
      return {...configuration,epoch:row.epoch,configurationHash:row.hash};
    }catch{throw new DomainError('SEMANTIC_CONFIGURATION_CORRUPT','Persisted reviewer configuration failed integrity checks');}
  };
  const attach=configuration=>{const current=semanticConfig(),checked=validateSemanticConfiguration(configuration);if(!current||current.configurationHash!==semanticHash(checked))throw new DomainError('SEMANTIC_CONFIGURATION_CHANGED','Current reviewer configuration differs');const lease=Object.freeze({epoch:current.epoch,configurationHash:current.configurationHash});semanticLeases.set(lease,current);return lease;};
  const requireLease=lease=>{const issued=semanticLeases.get(lease),current=semanticConfig();if(!issued||!current||issued.epoch!==current.epoch||issued.configurationHash!==current.configurationHash)throw new DomainError('SEMANTIC_CONFIGURATION_CHANGED','Reviewer configuration lease expired');return current;};
  const ordinaryRead=(id,revision)=>{
    const row=revision===undefined
      ? db.prepare(`SELECT typeof(snapshot) AS snapshot_type, length(snapshot) AS snapshot_length,
          CASE WHEN typeof(snapshot)='blob' AND length(snapshot)>? THEN NULL ELSE snapshot END AS snapshot
          FROM revisions JOIN heads USING(project_id,revision) WHERE project_id=?`).get(MAX_BLOB_BYTES,id)
      : db.prepare(`SELECT typeof(snapshot) AS snapshot_type, length(snapshot) AS snapshot_length,
          CASE WHEN typeof(snapshot)='blob' AND length(snapshot)>? THEN NULL ELSE snapshot END AS snapshot
          FROM revisions WHERE project_id=? AND revision=?`).get(MAX_BLOB_BYTES,id,revision);
    if (!row) throw new DomainError('NOT_FOUND','Project revision not found');
    return bindSemanticReader(decodeSnapshot(row),semanticConfig);
  };
  const scopedContext=()=>{
    const context=readAdmission.getStore();
    if (context?.closed) deny(context,'SNAPSHOT_READ_SCOPE_CLOSED','Snapshot read admission has closed');
    if (context && context.token!==token) deny(context,'SNAPSHOT_READ_SCOPE_MISMATCH','Snapshot read admission belongs to another store');
    return context;
  };
  const read=(id,revision)=>{
    const context=readAdmission.getStore();
    if (!context) return ordinaryRead(id,revision);
    context.usage.readAttempts++;
    try {
      scopedContext();
      if (context.failure) throw context.failure;
      if (id!==context.projectId) deny(context,'SNAPSHOT_READ_SCOPE_MISMATCH','Snapshot read admission belongs to another project');
      if (!Number.isSafeInteger(revision??0) || (revision??0)<0) deny(context,'SNAPSHOT_READ_CONFIGURATION','Nonnegative exact revision required');
      if (context.usage.readAttempts>context.limits.readAttempts) deny(context,'SNAPSHOT_READ_COUNT_LIMIT','Snapshot read attempt allowance exhausted');
      if (db.prepare('PRAGMA encoding').get().encoding!=='UTF-8') deny(context,'SNAPSHOT_READ_ENCODING_UNSUPPORTED','Snapshot read admission requires a UTF-8 database');
      let row,probe;
      db.exec('BEGIN');
      try {
        probe=revision===undefined
          ? db.prepare(`SELECT revision,typeof(snapshot) AS snapshot_type,length(CAST(snapshot AS BLOB)) AS stored_bytes,
              CASE WHEN typeof(snapshot)='blob' THEN substr(snapshot,1,84) ELSE NULL END AS header
              FROM revisions JOIN heads USING(project_id,revision) WHERE project_id=?`).get(id)
          : db.prepare(`SELECT revision,typeof(snapshot) AS snapshot_type,length(CAST(snapshot AS BLOB)) AS stored_bytes,
              CASE WHEN typeof(snapshot)='blob' THEN substr(snapshot,1,84) ELSE NULL END AS header
              FROM revisions WHERE project_id=? AND revision=?`).get(id,revision);
        if (!probe) throw new DomainError('NOT_FOUND','Project revision not found');
        context.usage.probeHeaderBytes+=probe.header?.byteLength??0;
        if (!Number.isSafeInteger(probe.stored_bytes) || probe.stored_bytes<0) throw readError('SNAPSHOT_STORAGE_TYPE','Unsupported snapshot storage length');
        let decoded;
        if (probe.snapshot_type==='text') decoded=probe.stored_bytes;
        else if (probe.snapshot_type==='blob') decoded=snapshotHeader(probe.header,probe.stored_bytes);
        else throw readError('SNAPSHOT_STORAGE_TYPE','Unsupported snapshot storage type');
        if (decoded>context.limits.snapshotBytes) deny(context,'SNAPSHOT_READ_SIZE_LIMIT','Snapshot decoded size exceeds admission');
        if (decoded>context.limits.decodedBytes-context.usage.reservedDecodedBytes || probe.stored_bytes>context.limits.storedBytes-context.usage.reservedStoredBytes) deny(context,'SNAPSHOT_READ_BYTES_LIMIT','Snapshot serialized byte allowance exhausted');
        context.usage.reservedDecodedBytes+=decoded;
        context.usage.reservedStoredBytes+=probe.stored_bytes;
        context.usage.fetchedSnapshots++;
        row=db.prepare(`SELECT typeof(snapshot) AS snapshot_type,length(CAST(snapshot AS BLOB)) AS snapshot_length,
          CASE WHEN typeof(snapshot)=? AND length(CAST(snapshot AS BLOB))=? THEN snapshot ELSE NULL END AS snapshot
          FROM revisions WHERE project_id=? AND revision=?`).get(probe.snapshot_type,probe.stored_bytes,id,probe.revision);
        db.exec('COMMIT');
      } catch(error) {db.exec('ROLLBACK');throw error;}
      const project=decodeSnapshot(row);
      context.usage.snapshotHash=row.snapshot_type==='blob'?Buffer.from(row.snapshot.subarray(20,52)).toString('hex'):createHash('sha256').update(row.snapshot).digest('hex');
      if (project?.id!==id || project?.revision!==probe.revision) throw corrupt('Snapshot identity differs from its SQL key');
      return bindSemanticReader(project,semanticConfig);
    } catch(error) {context.failure??=error;throw error;}
  };
  const withReadAdmission=(projectId,limits,work)=>{
    const parent=readAdmission.getStore();
    if (parent) deny(parent,parent.closed?'SNAPSHOT_READ_SCOPE_CLOSED':'SNAPSHOT_READ_NESTED','Nested snapshot read admission is forbidden');
    const usage={readAttempts:0,fetchedSnapshots:0,reservedDecodedBytes:0,reservedStoredBytes:0,probeHeaderBytes:0,physicalIo:'unmeasured',jsObjectMemory:'unmeasured'};
    const context={token,projectId,limits,usage,failure:null,closed:false};
    const finish=(value,error)=>{
      context.closed=true;
      const failure=context.failure??error;
      const observations={usage:{...usage},...(value===undefined?{}:{value}),...(error?{error}:{}),...(context.failure?{admissionError:context.failure}:{})};
      return failure?{kind:failure.code?.startsWith('SNAPSHOT_READ_')?'refused':'failed',code:failure.code??'SNAPSHOT_READ_FAILED',message:failure.message,...observations}:{kind:'complete',value,...observations};
    };
    if (typeof projectId!=='string' || !projectId || typeof work!=='function' || !limits || !['readAttempts','snapshotBytes','decodedBytes','storedBytes'].every(k=>Number.isSafeInteger(limits[k])&&limits[k]>0) || limits.snapshotBytes>MAX_RAW_BYTES) return finish(undefined,readError('SNAPSHOT_READ_CONFIGURATION','Positive safe admission limits and a project ID are required'));
    context.limits={...limits};
    return readAdmission.run(context,()=>{
      try {
        const value=work();
        return value && typeof value.then==='function'?Promise.resolve(value).then(v=>finish(v),error=>finish(undefined,error)):finish(value);
      } catch(error) {return finish(undefined,error);}
    });
  };
  const transaction=fn=>{
    db.exec('BEGIN IMMEDIATE');
    try {const result=fn();db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  };
  const save=p=>{
    db.prepare('INSERT INTO revisions(project_id,revision,snapshot) VALUES(?,?,?)').run(p.id,p.revision,encodeSnapshot(p));
    db.prepare('INSERT INTO heads(project_id,revision) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision').run(p.id,p.revision);
    return p;
  };
  const durability={closed:false,lastCommit:null,file:file===':memory:'?null:resolve(file)};
  const store={
    withReadAdmission,
    semanticConfiguration:semanticConfig,
    attachSemanticConfiguration:attach,
    requireSemanticLease:requireLease,
    registerSemanticConfiguration(configuration,{expectedEpoch}={}){forbidEffect();return transaction(()=>{const checked=validateSemanticConfiguration(configuration),current=semanticConfig();if(!Number.isSafeInteger(expectedEpoch)||expectedEpoch<0||(current?.epoch??0)!==expectedEpoch)throw new DomainError('SEMANTIC_CONFIGURATION_CONFLICT','Exact current epoch required');const digest=semanticHash(checked);if(current?.epoch===Number.MAX_SAFE_INTEGER&&current.configurationHash!==digest)throw new DomainError('SEMANTIC_CONFIGURATION_CONFLICT','Reviewer configuration epoch exhausted');if(!current||current.configurationHash!==digest)db.prepare('INSERT INTO semantic_configuration VALUES(1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET epoch=excluded.epoch,configuration=excluded.configuration,hash=excluded.hash').run((current?.epoch??0)+1,JSON.stringify(checked),digest);return attach(checked);});},
    readHead(id){
      assertStoreReadAdmission(store,id);
      const context=readAdmission.getStore();
      try {
        if(++context.usage.readAttempts>context.limits.readAttempts)deny(context,'SNAPSHOT_READ_COUNT_LIMIT','Read attempt allowance exhausted');
        const row=db.prepare('SELECT revision FROM heads WHERE project_id=?').get(id);
        if(!row)throw new DomainError('NOT_FOUND','Project not found');
        if(!Number.isSafeInteger(row.revision)||row.revision<0)throw corrupt('Invalid project head revision');
        return {projectId:id,revision:row.revision};
      } catch(error) {context.failure??=error;throw error;}
    },
    readAssistantProjection(id){
      assertStoreReadAdmission(store,id);
      const project=read(id);
      return assistantProjection(project,readAdmission.getStore().usage.snapshotHash);
    },
    create(input,context){forbidEffect();return transaction(()=>{
      if(db.prepare('SELECT 1 FROM heads WHERE project_id=?').get(input.id)) throw new DomainError('PROJECT_EXISTS','Project already exists');
      return save(createProject(input,context));
    });},
    read,
    list(){scopedContext();return db.prepare('SELECT project_id,revision FROM heads ORDER BY project_id').all().map(row=>({id:row.project_id,revision:row.revision}));},
    compactLegacyLayoutCommand(id,command,context){forbidEffect();const committed=transaction(()=>{
      const need=(ok,code)=>{if(!ok)throw new DomainError(code,'Verified immutable layout history required');};
      need(command&&Object.keys(command).sort().join(',')==='commandId,expectedRevision,kind,sourceRevision,targetCommandId'&&command.kind==='compact-legacy-layout-command'&&typeof command.commandId==='string'&&command.commandId.trim()&&command.commandId!=='__proto__'&&command.commandId!==command.targetCommandId&&typeof command.targetCommandId==='string'&&Number.isSafeInteger(command.expectedRevision)&&Number.isSafeInteger(command.sourceRevision)&&command.sourceRevision>0,'LAYOUT_CACHE_MIGRATION_INVALID');
      need(context&&['human','agent'].includes(context.actorType)&&['actorId','runId','contextId'].every(k=>typeof context[k]==='string'&&context[k].trim()),'LAYOUT_CACHE_MIGRATION_INVALID');
      const before=read(id),fingerprint=JSON.stringify(Object.fromEntries(Object.entries(command).filter(([key])=>key!=='expectedRevision')));
      if(Object.hasOwn(before.processedCommands,command.commandId)){need(before.processedCommands[command.commandId]===fingerprint,'COMMAND_ID_REUSED');return before;}
      need(before.revision===command.expectedRevision,'REVISION_CONFLICT');
      need(!before.jobs.some(j=>j.purpose==='final_operation_observation'||j.purpose==='final_review')&&!before.audit.some(a=>/final[-_]review|final[-_]operation/.test(a.kind))&&!Object.entries(before).some(([k,v])=>/^final(?:Operation|Review)/.test(k)&&Array.isArray(v)&&v.length),'LAYOUT_CACHE_FINAL_OPERATION_EXISTS');
      const raw=before.processedCommands[command.targetCommandId];let original;try{original=JSON.parse(raw);}catch{};
      need(typeof raw==='string'&&original?.kind==='prepare-project-layout'&&original.commandId===command.targetCommandId&&original.prepared&&typeof original.revisionIntent==='boolean'&&!isLayoutCommandWitness(original),'LAYOUT_CACHE_ORIGINAL_INVALID');
      const audits=before.audit.filter(a=>a.commandId===command.targetCommandId);
      need(audits.length===1&&audits[0].kind==='prepare-project-layout'&&audits[0].revision===command.sourceRevision,'LAYOUT_CACHE_HISTORY_INVALID');
      const created=read(id,command.sourceRevision),prior=read(id,command.sourceRevision-1);
      need(created.id===id&&prior.id===id&&created.revision===command.sourceRevision&&prior.revision===command.sourceRevision-1&&!Object.hasOwn(prior.processedCommands,command.targetCommandId)&&created.processedCommands[command.targetCommandId]===raw&&isDeepStrictEqual(created.audit.filter(a=>a.commandId===command.targetCommandId),audits),'LAYOUT_CACHE_HISTORY_INVALID');
      const binding=original.prepared.bindingHash,jobs=before.jobs.filter(j=>j.purpose==='layout_export'&&j.task?.bindingHash===binding&&j.task?.binding);
      need(/^[a-f0-9]{64}$/.test(binding??'')&&jobs.length===1&&jobs[0].id===`layout-${binding}`&&isDeepStrictEqual(jobs[0].task.input,original.prepared)&&isDeepStrictEqual(jobs[0].task.binding,original.prepared.binding)&&layoutFingerprintHash(JSON.stringify(original.prepared.binding))===binding,'LAYOUT_CACHE_JOB_INVALID');
      const canonical=JSON.stringify({kind:'prepare-project-layout',commandId:command.targetCommandId,revisionIntent:original.revisionIntent,prepared:jobs[0].task.input});
      need(raw===canonical,'LAYOUT_CACHE_NONCANONICAL_ORIGINAL');
      const after=structuredClone(before);after.processedCommands[command.targetCommandId]=layoutCommandWitness(original,raw,{sourceRevision:command.sourceRevision});after.revision++;after.processedCommands[command.commandId]=fingerprint;after.audit.push({commandId:command.commandId,kind:command.kind,actorId:context.actorId,revision:after.revision,at:context.now??null});return save(after);
    });durability.lastCommit=committed;return committed;},
    command(id,command,context,semanticLease){forbidEffect();const committed=transaction(()=>{
      if(command.kind==='request-coverage-challenge'||command.kind==='claim-coverage-dispatch'||command.kind==='complete-coverage-challenge')requireLease(semanticLease);
      const before=read(id);
      const failureJob=before.jobs.find(j=>j.id===command.jobId);
      if(['observe-readiness-terminal-failure','request-readiness-diagnostic'].includes(command.kind)||['start-job','complete-readiness'].includes(command.kind)&&failureJob?.readinessFailureResolutionId){
        if(!trustedTerminalFailureWitness(command.failureWitness))throw Object.assign(Error('Fresh managed terminal failure originals required'),{code:'INVALID_READINESS_TERMINAL_FAILURE'});
      }
      const after=applyCommand(before,command,context);
      return after.revision===before.revision?after:save(after);
    });durability.lastCommit=committed;return committed;},
    close(){forbidEffect();durability.closed=true;semanticClosed=true;db.close();},
  };
  storeTokens.set(store,token);
  if(file!==':memory:')durableStores.set(store,durability);
  return Object.freeze(store);
}
