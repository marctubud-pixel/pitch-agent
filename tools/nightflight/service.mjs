import {automaticResearchGaps,hasCategoryImage} from './research-sources.mjs';
import {validBriefScope} from './brief-intake.mjs';
import {libraryRequest} from './library.mjs';
import {validateResearchDigest, validateStrategyAdvice} from './research-digest.mjs';
import {isManuscriptSupport, manuscriptArtifact} from './manuscript.mjs';
import {finalProtocol} from './final-review.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  createReadStream,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  openSync,
  closeSync,
  fstatSync,
  readFileSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { normalizeOutlineOptions } from './proposal-outline.mjs';
import { engineCopyHandoffReady, isEngineCopyProtocol, headlineMarkdown, headlineProtocol, validSingleReview } from './copy-review.mjs';

const stages = ['brief', 'research', 'strategy', 'copy', 'visual', 'layout', 'final'];
const labels = ['简报与任务', '研究', '策略', '文案与主题', '视觉开发', '版式', '终审与交付'];
const safeId = /^[a-zA-Z0-9_-]{1,100}$/;
const now = () => new Date().toISOString();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function check(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
function filename(value) {
  check(
    typeof value === 'string' &&
      value.trim() &&
      value === basename(value) &&
      !value.startsWith('.') &&
      !/[\\/:\x00-\x1f]/u.test(value) &&
      Buffer.byteLength(value) <= 220,
    '文件名称无效',
  );
  return value;
}
function note(p, text) {
  p.events.push({ stage: p.stage, at: now(), text });
}
function archiveVersion(p) {
  p.versions.push({
    at: now(),
    stage: p.stage,
    artifacts: [...p.artifacts],
    ...(p.briefScope ? {briefScope:p.briefScope} : {}),
    research: p.research ?? null,
    directions: p.directions,
    copyReview: p.copyReview ?? null,
    ...(p.copyHandoff ? {copyHandoff:p.copyHandoff} : {}),
    ...(p.finalReview ? {finalReview:p.finalReview} : {}),
    choice: p.choice,
    visualAdoption: p.visualAdoption ?? null,
  });
}

// This gate is used only when accepting a new run. Historical tickets keep their original shape.
function copyHandoffReady(review, names, text) {
  if (isEngineCopyProtocol(review?.protocol)) return engineCopyHandoffReady(review,names,text);
  if(review?.protocol==='director-headline-v1') {
    const draft=review.draft?.directions;
    const reads=review.sloganWorkbook?.second;
    return review.status==='ready' && review.bodyHash===hash(text || '') &&
      draft?.length===3 && headlineMarkdown(review.draft)===text && reads?.length===2 &&
      new Set(draft.map(d=>d.duty)).size===3 && new Set(draft.map(d=>d.main)).size===3 &&
      names.every((name,i)=>name===draft[i].name && reads.every(r=>r.output.items.some(v=>v.text===draft[i].main && v.usable===true))) &&
      draft.some(d=>d.id===review.recommendation?.directionId) && Boolean(review.recommendation?.reason?.trim());
  }
  if (review?.protocol !== headlineProtocol || review.version !== 3 || review.status !== 'ready' ||
      !text || hash(text) !== review.bodyHash) return false;
  const draft = review.draft?.directions;
  if (draft?.length !== 3 || !names.every((name, i) => draft[i]?.name === name) ||
      !draft.every(d => typeof d.main === 'string' && d.main.trim() && !/[\r\n]/.test(d.main) &&
        !Object.hasOwn(d, 'secondary') && !Object.hasOwn(d, 'touchpoints')) ||
      headlineMarkdown(review.draft) !== text) return false;
  const roles = ['copy', 'brand', 'user', 'comms'];
  const reports = [review.anonymousReads, review.firstVotes, review.criticReads, review.challenges, review.finalVotes];
  if (!reports.every(group => Array.isArray(group) && group.length === roles.length &&
      roles.every(role => group.some(report => report.role === role)))) return false;
  const verdict = review.adjudication;
  return verdict?.ready === true && verdict.set?.ready === true && verdict.single?.length === 3 &&
    ['A', 'B', 'C'].every(id => verdict.single.some(item => item.directionId === id && item.ready === true &&
      validSingleReview(item,draft.find(d=>d.id===id)))) &&
    verdict.pairs?.length === 3 && ['AB', 'AC', 'BC'].every(pair =>
      verdict.pairs.some(item => item.pair === pair && item.distinct === true)) &&
    draft.some(item => item.id === review.recommendation?.directionId) &&
    ['reason','tradeoff','memory','retell','scene'].every(key=>typeof review.recommendation?.[key]==='string' && review.recommendation[key].trim());
}

function researchHandoff(report, project) {
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  const findings = Array.isArray(report?.findings)
    ? report.findings.filter((f) => f && [f.conclusion, f.evidence, f.source, f.implication].every(text))
    : [];
  const gaps = Array.isArray(report?.gaps) ? report.gaps.filter(g=>text(g) || (g && text(g.message) && text(g.kind))) : [];
  const missing = project.mode==='auto' ? automaticResearchGaps(report,project) : [];
  for (const gap of missing) if (!gaps.some(g=>g.message===gap.message)) gaps.push(gap);
  const ready = !missing.length && report?.ready === true && findings.length > 0 && findings.length === report.findings.length;
  if (!ready && !gaps.length) gaps.push('当前材料尚未提供可供策略使用的研究判断。');
  return {
    ready,
    ...(report?.carriers ? {carriers:report.carriers} : {}),
    ...(report?.searchScope ? {searchScope:report.searchScope} : {}),
    ...(text(report?.methodVersion) ? { methodVersion: report.methodVersion } : {}),
    findings,
    ...(Array.isArray(report?.sections) ? {sections:report.sections} : {}),
    ...(Array.isArray(report?.anchorQuestions) ? {anchorQuestions:report.anchorQuestions} : {}),
    ...(ready && report.digestPending===true ? {digestPending:true} : {}),
    ...(ready && report.digest !== undefined ? {digest:validateResearchDigest(report.digest,findings)} : {}),
    question:
      !ready &&
      findings.length &&
      project.mode === 'collab' &&
      !project.researchQuestionAnswered &&
      text(report?.question)
        ? report.question.trim()
        : '',
    gaps,
    next: text(report?.next) ? report.next : ready ? '' : '补查与本案决策相关的公开资料和实际案例。',
  };
}

// A round can schedule one evidence follow-up. Persist the flag before dispatch so a restart or retry
// cannot run another automatic round or repeat a question the customer has already answered.
function continueResearch(p, archived = false) {
  if (p.research.question || p.researchFollowup) {
    p.status = 'waiting';
    note(p, p.research.question || '定向补查后仍缺关键依据：' + p.research.next);
    return;
  }
  if (!archived) archiveVersion(p);
  p.artifacts = p.artifacts.filter((a) => a.stage === 'brief');
  p.researchFollowup = true;
  p.status = 'running';
  note(p, '按研究缺口开始定向补查：' + p.research.next);
}

function hasStrategyEvidence(r) {
  if (!Array.isArray(r?.findings)) return false;
  const cited = r.sections ? r.sections.flatMap(row=>row.evidenceIndices.map(i=>r.findings[i])) : r.findings;
  return cited.some(f => f && !f.visualOnly && /^https?:\/\//i.test(f.url) &&
    [f.passage, f.source, f.evidence, f.conclusion, f.implication].every(v => typeof v === 'string' && v.trim()));
}

function canRequestStrategy(p) {
  const r = p.research;
  return p.mode==='collab' && p.stage === 'research' && p.status === 'waiting' && !p.claim && r && !r.ready &&
    !r.digestPending &&
    hasStrategyEvidence(r);
}

function publicView(p) {
  const { owner, claim, attemptKey, inputHash, commands, ...visible } = p;
  const unstore = ({ storageKey, ...record }) => record;
  return {
    ...visible,
    canRequestStrategy: Boolean(canRequestStrategy(p)),
    canRenderManuscript: p.stage==='layout' && p.status==='waiting' && p.layoutDraftOnly && !p.layoutMaterialsOnly &&
      Boolean(manuscriptArtifact(p.artifacts)),
    artifacts: p.artifacts.map(unstore),
    attachments: p.attachments.map(unstore),
    versions: p.versions.map((v) => ({ ...v, artifacts: v.artifacts.map(unstore) })),
  };
}
async function body(req) {
  check(req.headers['content-type']?.split(';')[0] === 'application/json', '需要 JSON 请求', 415);
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    check(length <= 40 * 1024 * 1024, '每次提交的附件合计请控制在 28 MB 以内', 413);
    chunks.push(chunk);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch {}
  check(false, '请求格式错误');
}
const mime = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function createNightflight({ root, runStage, runLayout, runManuscript }) {
  root = resolve(root);
  const view = p => ({...publicView(p), canWriteManuscript:typeof runManuscript === 'function'});
  mkdirSync(root, { recursive: true, mode: 0o700 });
  // SQLite releases this exclusive writer reservation when the process dies.
  const lease = new DatabaseSync(join(root,'nightflight-owner.sqlite'));
  try { lease.exec('BEGIN IMMEDIATE'); }
  catch (error) { lease.close(); throw Error('该资料目录已有运行中的夜航服务',{cause:error}); }
  const instanceId = randomUUID();
  const db = new DatabaseSync(join(root, 'nightflight.sqlite'));
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL)',
  );
  db.exec(`CREATE TABLE IF NOT EXISTS project_events(project_id TEXT NOT NULL,entry TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_by_project ON project_events(project_id);
    CREATE TABLE IF NOT EXISTS artifact_texts(hash TEXT PRIMARY KEY,text TEXT NOT NULL)`);
  const eventOffset = Symbol('loaded events');
  function hydrate(raw) {
    const project=JSON.parse(raw);
    const events=db.prepare('SELECT entry FROM project_events WHERE project_id=? ORDER BY rowid').all(project.id);
    project.events=[...(project.events || []),...events.map(row=>JSON.parse(row.entry))];
    project[eventOffset]=events.length;
    for (const group of [project,...project.versions]) for (const file of group.artifacts) {
      if (!file.textHash) continue;
      const row=db.prepare('SELECT text FROM artifact_texts WHERE hash=?').get(file.textHash);
      check(row,'已保存的正文缺失',500);
      file.text=row.text;
      delete file.textHash;
    }
    return project;
  }
  function persist(project, write) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const append = db.prepare('INSERT INTO project_events VALUES(?,?)');
      for (const event of project.events.slice(project[eventOffset] || 0)) append.run(project.id,JSON.stringify(event));
      const insert=db.prepare('INSERT OR IGNORE INTO artifact_texts VALUES(?,?)');
      function externalize(group) {
        return {...group,artifacts:group.artifacts.map(file=>{
          if (typeof file.text!=='string') return file;
          const {text,...fields}=file;
          const textHash=hash(text);
          insert.run(textHash,text);
          return {...fields,textHash};
        })};
      }
      write(JSON.stringify({...externalize(project),events:[],versions:project.versions.map(externalize)}));
      db.exec('COMMIT');
      project[eventOffset]=project.events.length;
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  // Migrate old inline payloads before accepting progress events, so their ordering stays intact.
  for (const {id,state} of db.prepare("SELECT id,state FROM projects WHERE json_array_length(state,'$.events')>0 OR EXISTS (SELECT 1 FROM json_each(state,'$.artifacts') WHERE json_type(value,'$.text')='text')").all()) {
    persist(hydrate(state),raw=>db.prepare('UPDATE projects SET state=? WHERE id=?').run(raw,id));
  }
  const get = (id) => {
    const row = db.prepare('SELECT state FROM projects WHERE id=?').get(id);
    return row && hydrate(row.state);
  };
  const list = () =>
    db
      .prepare(
        "SELECT id,json_extract(state,'$.title') AS title,json_extract(state,'$.status') AS status,json_extract(state,'$.stage') AS stage,json_extract(state,'$.updatedAt') AS updatedAt FROM projects ORDER BY updatedAt DESC",
      )
      .all();
  const jobs = new Map();
  let closing = false;
  function save(p) {
    const old = p.revision;
    p.revision++;
    p.updatedAt = now();
    persist(p,raw=>check(
      db
        .prepare('UPDATE projects SET revision=?,state=? WHERE id=? AND revision=?')
        .run(p.revision, raw, p.id, old).changes === 1,
      '项目已更新，请刷新后再试',
      409,
    ));
  }
  function disk(p, key) {
    return join(root, p.id, 'files', key);
  }
  function historicalImage(project,ref) {
    for (const group of [project,...project.versions.toReversed()]) {
      for (const file of group.artifacts) {
        if (file.stage!=='research' || file.kind!=='image' || file.name!==ref.name) continue;
        const bytes=readFileSync(disk(project,file.storageKey));
        if (hash(bytes)===ref.sha256) return {file,bytes};
      }
    }
  }
  function storeFile(p, name, source, kind) {
    const storageKey = randomUUID() + extname(name);
    const path = disk(p, storageKey);
    if (Buffer.isBuffer(source)) writeFileSync(path, source, { flag: 'wx', mode: 0o600 });
    else {
      const fd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = fstatSync(fd);
        check(stat.isFile() && stat.size > 0 && stat.size <= 128 * 1024 * 1024, '产物为空或过大');
        writeFileSync(path, readFileSync(fd), { flag: 'wx', mode: 0o600 });
      } finally {
        closeSync(fd);
      }
    }
    return { name, kind, storageKey, url: '/api/projects/' + p.id + '/files/' + storageKey };
  }
  function schedule(id) {
    if (closing || jobs.has(id)) return;
    const abort = new AbortController();
    jobs.set(id, abort);
    setImmediate(async () => {
      let claim, dir;
      const unpublished=new Set();
      function prune(keep) {
        for (const entry of readdirSync(join(root,id),{withFileTypes:true})) {
          const path=join(root,id,entry.name);
          if (!entry.isDirectory() || !/^attempt-[a-zA-Z0-9]{6}$/.test(entry.name) || path===keep) continue;
          const receipts=join(root,id,'receipts',entry.name);
          for (const file of readdirSync(path,{withFileTypes:true})) {
            if (!['.codex-runs','.image-api-runs','.research-evidence','.visual-search-evidence'].includes(file.name) && !/^(copy-review-attempt-|reference-admission-|visual-review-).*\.json$|\.receipt\.json$/.test(file.name)) continue;
            mkdirSync(receipts,{recursive:true,mode:0o700});
            renameSync(join(path,file.name),join(receipts,file.name));
          }
          rmSync(path,{recursive:true,force:true});
        }
      }
      try {
        while (!closing) {
          const p = get(id);
          if (!p || p.status !== 'running' || p.claim) break;
          claim = randomUUID();
          p.claim = claim;
          p.owner = instanceId;
          if (!/^[0-9a-f-]{36}$/.test(p.attemptKey ?? '')) p.attemptKey=randomUUID();
          note(p, '开始' + labels[stages.indexOf(p.stage)]);
          save(p);
          dir = mkdtempSync(join(root, id, 'attempt-'));
          const input = publicView(p);
          input.feedback=p.feedback.filter(f=>f.stage===p.stage && f.version===(p.stageVersions?.[p.stage] || 0));
          if (p.stage==='layout') input.previousLayoutChanges=p.layoutChanges || [];
          if (p.stage === 'research' && !p.researchDigestOnly) {
            const previous = p.versions.findLast(
              (v) => v.research || v.artifacts.some((a) => a.stage === 'research'),
            );
            if (previous)
              input.previousResearch = previous.research ?? {
                legacyText: previous.artifacts
                  .filter((a) => a.stage === 'research' && a.kind === 'text')
                  .map((a) => a.text)
                  .join('\n'),
              };
            if (previous?.research) {
              const refs = previous.research.findings?.flatMap(f=>f.images ?? []) ?? [];
              const copied = new Set();
              if (p.research?.strategyReturned && input.previousResearch) {
                input.previousResearch = {...input.previousResearch, next:p.research.next};
              }
              input.previousResearchImages = refs.map(ref=>{
                const original=historicalImage(p,ref);
                check(original,'历史竞品研究原图与哈希无法核对',422);
                const {file,bytes}=original;
                const path = join(dir,'previous-'+ref.sha256+'-'+filename(file.name));
                if (!copied.has(path)) {
                  writeFileSync(path,bytes,{flag:'wx',mode:0o600});
                  copied.add(path);
                }
                return {...ref,path,imageId:'ref_'+ref.sha256,byteLength:bytes.length,mediaType:mime[extname(file.name).toLowerCase()]};
              });
            }
          }
          if (p.stage === 'visual') {
            const retained = new Set();
            input.researchReferences = [];
            for (const finding of p.research?.findings ?? []) {
              if (finding.visualOnly) continue;
              for (const ref of finding.images ?? []) {
                if (!['packaging','kv'].includes(ref.carrier) || !hasCategoryImage([ref],ref.carrier) || retained.has(ref.sha256)) continue;
                const original=historicalImage(p,ref);
                if (!original) continue;
                const {file,bytes}=original;
                const path=join(dir,'research-visual-'+ref.sha256+extname(file.name));
                writeFileSync(path,bytes,{flag:'wx',mode:0o600});
                retained.add(ref.sha256);
                input.researchReferences.push({path,name:file.name,sha256:ref.sha256,byteLength:bytes.length,
                  mediaType:mime[extname(file.name).toLowerCase()],carrier:ref.carrier,title:ref.title,
                  sourceUrl:ref.sourceUrl,pageUrl:ref.pageUrl,query:'同版研究原图'});
              }
            }
            const last = p.versions.at(-1);
            const previous = last?.artifacts.some(a=>a.visual?.candidate) ? last : undefined;
            input.previousReferences = (previous?.artifacts ?? []).filter(a => a.visual?.role === 'reference').map(a => {
              const path = join(dir, 'previous-'+filename(a.name));
              copyFileSync(disk(p,a.storageKey), path, constants.COPYFILE_EXCL);
              const bytes = readFileSync(path);
              check(hash(bytes) === a.visual.sha256, '上版公开参考图与原件身份不一致', 422);
              return {...a.visual, name:a.name, path, byteLength:bytes.length, mediaType:mime[extname(a.name).toLowerCase()]};
            });
            input.previousVisual = previous?.artifacts.filter(a=>a.visual?.candidate).map(a => {
              const path = join(dir, 'previous-'+filename(a.name));
              copyFileSync(disk(p,a.storageKey),path,constants.COPYFILE_EXCL);
              const bytes = readFileSync(path);
              return {adopted:previous.visualAdoption?.artifacts?.includes(a.storageKey)===true,visual:a.visual,image:{path,imageId:'previous',sha256:hash(bytes),byteLength:bytes.length,mediaType:'image/png'}};
            });
          }
          if (p.stage === 'layout') {
            const adopted = new Set(p.visualAdoption?.artifacts ?? []);
            const directions = new Set(p.artifacts.filter(a => adopted.has(a.storageKey)).map(a => a.visual?.direction));
            const compared = p.artifacts.filter(a => a.stage === 'visual' && a.visual?.role === 'comparison' &&
              directions.has(a.visual.direction)).flatMap(a => a.visual.references ?? []);
            const originals = p.artifacts.filter(a => a.visual?.role === 'reference' && directions.has(a.visual.direction));
            input.layoutCompetitorReferences = [...p.attachments, ...originals].filter(a => compared.includes(a.name)).map(a => a.name);
          }
          for (const type of ['artifacts', 'attachments']) {
            const source = type === 'attachments' && p.stage === 'layout'
              ? [...p.attachments, ...(p.visualAdoption?.materials ?? []), ...p.artifacts.filter(a =>
                a.visual?.role === 'reference' && input.layoutCompetitorReferences.includes(a.name))] : p[type];
            const records = p.researchDigestOnly ? [] : source.filter(a=>!(type==='artifacts' && a.visual?.role==='reference') && !(p.stage==='layout' && (a.visual?.candidate || a.visual?.role==='comparison') && !p.visualAdoption?.artifacts.includes(a.storageKey)));
            input[type] = records.map((record) => {
              const path = join(dir, filename(record.name));
              copyFileSync(disk(p, record.storageKey), path, constants.COPYFILE_EXCL);
              return { name: record.name, kind: record.kind, stage: record.stage, text: record.text, visual:record.visual, ...(p.visualAdoption?.artifacts?.includes(record.storageKey) ? {adoptedForLayout:true} : {}), visualOnly:record.visualOnly, renderPage:record.renderPage, ...(record.strategyHash ? {strategyHash:record.strategyHash} : {}), path };
            });
          }
          if (p.stage==='copy') {
            const sources=input.artifacts.filter(file=>file.stage==='strategy' && file.kind==='text');
            check(sources.length,'未找到本项目当前策略稿，无法交给文案',422);
            input.strategyHandoff=sources.map(file=>{
              const bytes=readFileSync(file.path);
              const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
              const sha256=hash(bytes);
              check(text.trim() && (!file.strategyHash || file.strategyHash===sha256) &&
                (file.text===undefined || text===file.text || text===file.text+'\n'),
                '策略副本与本项目存档不一致或正文为空，请先核对策略稿',422);
              return {name:file.name,sha256};
            });
          }
          const onEvent = (text) => {
            if (typeof text==='string' && text.trim()) {
              const event=JSON.stringify({stage:p.stage,at:now(),text:text.slice(0,500)});
              db.prepare("INSERT INTO project_events(project_id,entry) SELECT id,? FROM projects WHERE id=? AND json_extract(state,'$.claim')=?").run(event,id,claim);
            }
          };
          onEvent('比稿负责人执行「'+labels[stages.indexOf(p.stage)]+'」');
          const runner = p.stage === 'layout' ? (p.layoutDraftOnly ? runManuscript : runLayout) : runStage;
          check(typeof runner === 'function', '当前工作台缺少这个阶段的执行器', 409);
          const job={
            stage: p.stage,
            project: input,
            dir,
            onEvent,
            checkpointDir: join(root,id,'.call-checkpoints',p.attemptKey),
            signal: abort.signal,
          };
          let draftArtifacts=[];
          if (p.stage==='layout' && p.layoutFromManuscript && !p.layoutDraftOnly && !manuscriptArtifact(input.artifacts)) {
            check(typeof runManuscript==='function','请配置夜航文字及读图 API 后编稿',409);
            const drafted=await runManuscript(job);
            draftArtifacts=drafted.artifacts.map(file=>({...file,stage:'layout'}));
            check(manuscriptArtifact(draftArtifacts),'排版前未取得同版逐页稿',422);
            input.artifacts.push(...draftArtifacts);
          }
          const result = await runner(job);
          if (draftArtifacts.length) result.artifacts=[...draftArtifacts,...result.artifacts];
          const live = get(id);
          check(live?.claim === claim, '该次运行已结束', 409);
          if (p.stage === 'layout' && p.layoutDraftOnly) {
            check(result.artifacts?.length && result.artifacts.every(a=>a.kind==='text'),
              '仅写逐页稿时只接收文字产物', 422);
          }
          if (p.researchDigestOnly) {
            const digest = validateResearchDigest(result.researchDigest,live.research.findings);
            const strategyAdvice = validateStrategyAdvice(result.strategyAdvice,digest);
            archiveVersion(live);
            live.research = {...live.research,digest,strategyAdvice};
            delete live.researchDigestOnly;
            delete live.research.digestPending;
            if (live.mode==='auto' && automaticResearchGaps(live.research,live).length) {
              live.research=researchHandoff(live.research,live);
              continueResearch(live,true);
            } else if (p.researchOnly) live.status = 'waiting';
            else live.stage = 'strategy';
            live.error = null;
            live.claim = null;
            live.owner = null;
            note(live,'已从本版核实发现编辑研究摘要');
            delete live.attemptKey;
            save(live);
            prune();
            claim = null;
            continue;
          }
          if (p.stage==='brief') {
            check(validBriefScope(result.briefScope),'简报缺少有效的提案范围判断',422);
            const {status,types,reason}=result.briefScope;
            live.briefScope={status,types,reason:reason.trim()};
          }
          const needsBriefInput=p.stage==='brief' && live.briefScope.status!=='accepted';
          check(Array.isArray(result.artifacts) && (needsBriefInput ? result.artifacts.length===0 : result.artifacts.length>0), '这一阶段没有交回文件', 422);
          if (p.stage === 'copy') {
            const names = result.directions;
            const review = result.copyReview;
            const text = result.artifacts.find((a) => a.kind === 'text' && typeof a.text === 'string')?.text;
            check(Array.isArray(names) && names.length === 3 && names.every((d) => typeof d === 'string' && d.trim())
              && new Set(names).size === 3, '文案未交回三个不同方向', 422);
            check(copyHandoffReady(review, names, text), '本版文案或对应的选句记录不完整，不能交接', 422);
            live.directions = names;
            live.copyReview = review;
            live.copyHandoff={projectId:live.id,strategy:input.strategyHandoff};
          }
          if (p.stage === 'visual') {
            const expected = p.mode==='collab' ? [p.choice] : p.directions;
            for (const ref of result.artifacts.filter(a => a.visual?.role === 'reference')) {
              const v = ref.visual;
              check(ref.kind === 'image' && /\.(?:png|jpe?g)$/i.test(ref.name) && expected.includes(v.direction) &&
                /^[a-f0-9]{64}$/.test(v.sha256) && [v.pageUrl,v.sourceUrl].every(url => URL.canParse(url) && new URL(url).protocol === 'https:') &&
                typeof v.query === 'string' && v.query.trim() && !v.candidate && !v.recommended, '公开参考图来源或方向记录无效', 422);
            }
            const images = result.artifacts.filter(a=>a.kind==='image' && !['comparison','reference','slogan-original'].includes(a.visual?.role));
            for (const original of result.artifacts.filter(a=>a.visual?.role==='slogan-original')) {
              const v=original.visual;
              check(original.kind==='image' && /^[a-f0-9]{64}$/.test(v.sha256) && !v.candidate && !v.recommended &&
                images.some(a=>a.visual?.direction===v.direction && a.visual.sloganRepair?.sourceName===original.name &&
                  a.visual.sloganRepair.sourceSha256===v.sha256), '标题修订缺少同方向初稿或对应回执', 422);
            }
            check(images.length===expected.length*3 && expected.every(direction=>{
              const batch = images.filter(a=>a.visual?.direction===direction).map(a=>a.visual);
              if (![1,2,3].every(i=>batch.some(a=>a.candidate===i)) || !batch.every(a=>a.role==='main' &&
                ['first','action','words','alternative'].every(k=>typeof a.blind?.[k]==='string' && a.blind[k].trim()) &&
                typeof a.edit==='string' && a.edit.trim() && typeof a.research==='string' && a.research.trim() &&
                ['视觉','品牌','用户','传播'].every(role=>a.scores?.some(v=>v.role===role && Number.isInteger(v.score) && v.score>=1 && v.score<=5)) &&
                a.scores.length===4 && a.mean===a.scores.reduce((sum,v)=>sum+v.score,0)/4 && typeof a.blocked==='boolean' && a.reason?.trim())) return false;
              const eligible = batch.filter(a=>!a.blocked && a.mean>=4);
              const winners = batch.filter(a=>a.recommended);
              return eligible.length ? winners.length===1 && eligible.includes(winners[0]) && winners[0].mean===Math.max(...eligible.map(a=>a.mean)) : !winners.length;
            }), '视觉阶段需要每方向三张同版主视觉及完整复核推荐', 422);
          }
          const final=p.stage==='final' ? result.finalReview : null;
          const refined=final?.protocol===finalProtocol && ['ready','blocked'].includes(final.outcome);
          if (refined) {
            const original=live.artifacts.findLast(a=>a.stage==='layout' && a.kind==='pptx');
            const files=result.artifacts.filter(a=>a.finalLayout);
            const newPptx=files.filter(a=>a.kind==='pptx');
            const batch=final.pptx?.match(/^提案-([a-f0-9-]{36})\.pptx$/u)?.[1];
            check(batch && original?.name===final.originalPptx && original.name!==final.pptx &&
              newPptx.length===1 && newPptx[0].name===final.pptx &&
              hash(readFileSync(join(dir,filename(final.pptx))))===final.sha256 &&
              files.filter(a=>a.name==='提案预览-'+batch+'.deck.json').length===1 &&
              files.filter(a=>a.name==='终审逐页稿-'+batch+'.plan.json').length===1 &&
              result.artifacts.some(a=>a.name===final.contact && a.kind==='image' && !a.finalLayout) &&
              result.artifacts.some(a=>a.name===final.report && a.kind==='text' && !a.finalLayout) &&
              [2,3].includes(final.rounds),'精修版与原版、全览或终审回执无法核对',422);
            archiveVersion(live);
            live.artifacts=live.artifacts.filter(a=>a.stage!=='layout' || isManuscriptSupport(a.name));
            live.layoutChanges=[];
          }
          const occupied = new Set(
            [...live.attachments, ...live.artifacts].map((a) => a.name.normalize('NFC').toLowerCase()),
          );
          const outputs = result.artifacts.map((a) => {
            const name = filename(a.name),
              key = name.normalize('NFC').toLowerCase();
            check(!occupied.has(key), '产物文件名重复：' + name, 422);
            occupied.add(key);
            check(['image', 'pptx', 'text'].includes(a.kind), '产物类型无效', 422);
            const stage=refined && a.finalLayout ? 'layout' : p.stage;
            const stored=storeFile(live,name,join(dir,name),a.kind);
            unpublished.add(disk(live,stored.storageKey));
            const strategyHash=p.stage==='strategy' && a.kind==='text' ? hash(readFileSync(disk(live,stored.storageKey))) : null;
            return {
              ...stored, ...(strategyHash ? {strategyHash} : {}),
              stage,
              ...(stage==='layout' && Number.isInteger(a.renderPage) ? {renderPage:a.renderPage} : {}),
              ...(p.stage === 'visual' && a.visual ? {visual:a.visual} : {}),
              ...(typeof a.text === 'string' ? { text: a.text } : {}),
            };
          });
          for (const ref of outputs.filter(file => file.visual?.role === 'reference')) {
            check(hash(readFileSync(disk(live, ref.storageKey))) === ref.visual.sha256, '公开参考原件与来源记录不一致', 422);
          }
          if (p.stage === 'research') {
            for (const ref of result.research?.findings?.flatMap(f=>f.images ?? []) ?? []) {
              let file = outputs.find(a=>a.kind==='image' && a.name===ref.name);
              if (!file) {
                file=historicalImage(live,ref)?.file;
                if (file && !live.artifacts.some(a=>a.storageKey===file.storageKey)) outputs.push(file);
              }
              check(file && [ref.sourceUrl,ref.pageUrl].every(url=>URL.canParse(url) && new URL(url).protocol==='https:') &&
                ref.observation?.trim() && ref.title?.trim() && hash(readFileSync(disk(live,file.storageKey)))===ref.sha256,
                '竞品观察需要本轮原图、来源和匹配的图片哈希',422);
            }
          }
          live.artifacts.push(...outputs);
          if (p.stage==='layout' && Array.isArray(result.layoutChanges)) live.layoutChanges=result.layoutChanges;
          live.claim = null;
          live.owner = null;
          if (outputs.length) note(live, '已保存' + outputs.length + '份' + labels[stages.indexOf(p.stage)] + '产物');
          if (p.stage === 'research') {
            live.research = researchHandoff(result.research, live);
            if (live.research.ready) {
              if (live.research.digestPending) {
                live.researchDigestOnly = true;
                note(live,'已保存完整研究底稿，继续编辑客户摘要');
              } else if (live.researchOnly) {
                live.status = 'waiting';
                note(live, '本轮研究已完成，可查看证据后进入策略');
              } else {
                note(live, '研究已形成有依据的判断，交给策略');
                live.stage = 'strategy';
              }
            } else {
              continueResearch(live);
            }
          } else if (needsBriefInput) {
            live.status='waiting';
            note(live,live.briefScope.reason);
          } else if (p.stage === 'brief' && p.mode==='collab') {
            live.status='waiting';
            note(live,'请确认任务卡后开始研究');
          } else if (p.stage === 'copy' && p.mode === 'collab') {
            live.status = 'waiting';
            note(live, '等待你选择创意方向');
          } else if (p.stage === 'visual') {
            live.status = 'waiting';
            note(live, outputs.some(a=>a.visual?.candidate && !outputs.some(w=>w.visual?.direction===a.visual.direction && w.visual.recommended)) ? '有方向尚无达标主视觉，请查看原因并修改' : '每方向已推荐同批达标最高稿，等待采用');
          } else if (p.stage === 'layout' && p.layoutDraftOnly) {
            live.status = 'waiting';
            note(live, p.layoutMaterialsOnly ? '本版编稿材料和读图回执已保存，可以在版式下载' :
              '本版逐页稿、编稿材料和读图回执已保存，可以在版式查看');
          } else if (p.stage === 'final') {
            const review=result.finalReview;
            check(review && (refined || ['pass','return'].includes(review.outcome)) && typeof review.reason==='string' && review.reason.trim() && Array.isArray(review.pages),'终审未交回有效裁定',422);
            live.finalReview=review;
            const pages=live.artifacts.filter(a=>a.stage==='layout' && Number.isInteger(a.renderPage)).map(a=>a.renderPage).sort((a,b)=>a-b);
            check(new Set(review.pages).size===review.pages.length && review.pages.every(n=>pages.includes(n)),'终审页码与排版实图不符',422);
            if (review.outcome==='pass' || refined) check(pages.length && pages.every((n,i)=>n===i+1 && review.pages.includes(n)),'终审通过前须覆盖每一页排版实图',422);
            if (review.outcome==='return') {
              check(stages.includes(review.returnStage) && review.returnStage!=='final','终审退回阶段无效',422);
              revise(live,review.returnStage,review.reason,review.protocol===finalProtocol?'final_gate':'final');
              live.finalReturn=review;
              live.status='waiting';
              note(live,'终审退回'+labels[stages.indexOf(review.returnStage)]+'：'+review.reason);
            } else if (refined) {
              live.status='waiting';
              note(live,review.reason);
            } else {
              live.status = 'done';
              note(live, '终审演练完成，可查看核对记录与 PPTX');
            }
          } else live.stage = stages[stages.indexOf(p.stage) + 1];
          const completedKey=p.attemptKey;
          delete live.attemptKey;
          save(live);
          unpublished.clear();
          prune();
          rmSync(join(root,id,'.call-checkpoints',completedKey),{recursive:true,force:true});
          claim = null;
        }
      } catch (error) {
        for (const path of unpublished) rmSync(path,{force:true});
        const p = get(id);
        if (p && p.claim === claim) {
          if (p.researchDigestOnly && !p.research?.digest) p.research.digestPending = true;
          p.status = p.researchDigestOnly ? 'waiting' : 'failed';
          delete p.researchDigestOnly;
          p.claim = null;
          p.owner = null;
          p.error = String(error.message).slice(0, 1800);
          note(p, p.error);
          save(p);
          if (dir) prune(dir);
        }
      } finally {
        jobs.delete(id);
        if (closing) {
          if (!jobs.size) { db.close(); lease.close(); }
        } else {
          const p = get(id);
          if (p?.status === 'running' && !p.claim) schedule(id);
        }
      }
    });
  }
  // A restarted server must expose interrupted work for an explicit retry, never replay it on launch.
  for (const { id, status } of list())
    if (status === 'running') {
      const p = get(id);
      {
        p.claim = null;
        p.owner = null;
        if (p.researchDigestOnly && !p.research?.digest) p.research.digestPending = true;
        p.status = p.researchDigestOnly ? 'waiting' : 'failed';
        delete p.researchDigestOnly;
        p.error = '本地服务已重启，请核对已保存的结果后重试当前阶段。';
        note(p, p.error);
        save(p);
      }
    }
  function parseAttachments(attachments, existing = [], scope = 'project') {
    check(Array.isArray(attachments) && attachments.length <= 32, '单次最多 32 个附件');
    const isImage = (a) => /\.(png|jpe?g)$/i.test(a.name);
    check(
      scope !== 'project' || [...existing.filter((a) => a.kind === 'attachment' && !a.visualOnly), ...attachments].filter(isImage).length <= 4,
      '一个项目最多上传四张参考图',
    );
    const names = new Set(existing.map((a) => a.name.normalize('NFC').toLowerCase()));
    let total = 0;
    return attachments.map((a) => {
      const name = filename(a.name),
        key = name.normalize('NFC').toLowerCase();
      check(!names.has(key), '附件文件名重复：' + name);
      names.add(key);
      check(typeof a.data === 'string' && a.data.length && a.data.length % 4 === 0, '附件内容为空或损坏');
      check(/\.(md|txt|pdf|docx|pptx|png|jpe?g)$/i.test(name), '不支持的附件格式');
      const bytes = Buffer.from(a.data, 'base64');
      check(bytes.toString('base64') === a.data, '附件编码错误');
      total += bytes.length;
      if (isImage(a)) check(bytes.length <= 8 * 1024 * 1024, '每张参考图最多 8 MB');
      if (/\.pdf$/i.test(name)) check(bytes.length <= 12 * 1024 * 1024, '每份 PDF 最多 12 MB');
      check(total <= 28 * 1024 * 1024, '附件合计不能超过 28 MB');
      return { name, bytes };
    });
  }
  function create(input) {
    const id = input.id,
      brief = input.brief?.trim(),
      attachments = input.attachments ?? [];
    check(typeof id === 'string' && safeId.test(id), '项目编号无效');
    check(
      typeof brief === 'string' && (brief.length || attachments.length) && brief.length <= 64000,
      '请填写需求或上传 Brief',
    );
    check(['auto', 'collab'].includes(input.mode), '工作模式无效');
    check(Array.isArray(attachments) && attachments.length <= 32, '单次最多 32 个附件');
    const kind = input.proposalKind;
    check(kind === undefined || ['packaging', 'kv'].includes(kind), '提案类型无效');
    const options = normalizeOutlineOptions(kind, input.outlineOptions);
    const config = {
      ...(input.researchOnly===true ? {researchOnly:true} : {}),
      ...(kind ? { proposalKind: kind } : {}),
      ...(options.include.length || options.singleTouchpoint ? { outlineOptions: options } : {}),
    };
    const identity = [brief, input.mode, attachments.map((a) => [a.name, a.data])];
    if (Object.keys(config).length) identity.push(config);
    const inputHash = hash(JSON.stringify(identity));
    const existing = get(id);
    if (existing) {
      check(existing.inputHash === inputHash, '此项目编号已用于不同任务', 409);
      return existing;
    }
    const files = parseAttachments(attachments);
    const p = {
      id,
      inputHash,
      ...config,
      brief,
      mode: input.mode,
      title: (brief.split('\n')[0] || files[0]?.name || '新提案').slice(0, 64),
      stage: 'brief',
      status: 'running',
      revision: 1,
      updatedAt: now(),
      commands: {},
      claim: null,
      owner: null,
      attachments: [],
      artifacts: [],
      versions: [],
      feedback: [],
      events: [],
      directions: [],
      choice: null,
    };
    mkdirSync(join(root, id, 'files'), { recursive: true, mode: 0o700 });
    p.attachments = files.map((f) => storeFile(p, f.name, f.bytes, 'attachment'));
    note(p, '已收到需求，开始简报阶段');
    persist(p,raw=>db.prepare('INSERT INTO projects VALUES(?,?,?)').run(id,p.revision,raw));
    schedule(id);
    return p;
  }
  function bumpVersion(p,stage) {
    p.stageVersions ||= {};
    p.stageVersions[stage]=(p.stageVersions[stage] || 0)+1;
    delete p.attemptKey;
  }
  function revise(p,target,text,source='user') {
    archiveVersion(p);
    const start=stages.indexOf(target);
    for (const stage of stages.slice(start)) bumpVersion(p,stage);
    const keepDraft=target==='layout' && p.layoutFromManuscript && !p.layoutDraftOnly;
    p.artifacts=p.artifacts.filter(a=>stages.indexOf(a.stage)<start || keepDraft && a.stage==='layout' && isManuscriptSupport(a.name));
    if (target==='brief') delete p.briefScope;
    if (start<=1) { p.research=null; p.researchOnly=false; p.researchFollowup=false; p.researchQuestionAnswered=false; delete p.researchDigestOnly; }
    if (start<=3) { delete p.copyHandoff; p.copyReview=null; p.directions=[]; p.choice=null; }
    if (start<=4) {p.visualAdoption=null; p.layoutChanges=[]; delete p.layoutDraftOnly; delete p.layoutMaterialsOnly;delete p.layoutFromManuscript;}
    if (start<4) p.visualRevisions=0;
    p.stage=target; p.error=null;
    delete p.finalReturn;
    delete p.finalReview;
    p.feedback.push({stage:target,version:p.stageVersions[target],at:now(),text,source});
  }
  function action(p, input) {
    const { kind, opId } = input;
    check(input.text===undefined || typeof input.text==='string','消息必须是文字');
    const text=(input.text || '').trim();
    check(typeof text === 'string' && text.length <= 64000, '消息过长');
    const attachments = input.attachments ?? [];
    const commandHash = hash(JSON.stringify([kind, text, attachments, input.expectedRevision, ...(input.researchOnly === true ? [true] : []), ...['targetStage','candidateIds','overrideReason','draftOnly','materialsOnly'].filter(k=>input[k]!==undefined).map(k=>[k,input[k]])]));
    if (opId) {
      check(safeId.test(opId) && !Object.hasOwn(Object.prototype, opId), '动作编号无效');
      if (Object.hasOwn(p.commands, opId)) {
        check(p.commands[opId] === commandHash, '动作编号冲突', 409);
        return p;
      }
    }
    if ((kind==='message' && input.expectedRevision!==undefined) || kind==='confirm_brief' || kind === 'research_digest' || kind === 'choice' || kind === 'adopt' || kind === 'render_manuscript' || kind === 'research_again' || kind === 'research_continue' || kind==='accept_final')
      check(input.expectedRevision === p.revision, '项目版本已更新，请查看最新结果再决定', 409);
    if (p.stage==='brief' && p.briefScope && p.briefScope.status!=='accepted' && ['confirm_brief','retry'].includes(kind))
      check(false,'请先补充或重新描述提案需求',409);
    if (kind==='confirm_brief') {
      check(p.mode==='collab' && p.stage==='brief' && p.status==='waiting' && !p.finalReturn,'当前没有待确认任务卡',409);
      p.researchOnly = input.researchOnly === true;
      p.stage='research'; p.status='running'; note(p,'用户已确认任务卡');
    } else if (kind === 'choice') {
      check(
        p.status === 'waiting' && !p.finalReturn && p.stage === 'copy' && p.directions.includes(text),
        '当前方向不可选',
        409,
      );
      p.choice = text;
      note(p, '已选择：' + text);
      p.stage = 'visual';
      p.status = 'running';
    } else if (kind === 'adopt') {
      check(p.status === 'waiting' && !p.finalReturn && p.stage === 'visual', '当前没有待采用的图稿', 409);
      check(input.draftOnly === undefined || typeof input.draftOnly === 'boolean', '逐页编稿选项无效');
      check(input.materialsOnly === undefined || (input.draftOnly === true && input.materialsOnly === true), '材料包选项无效');
      check(!input.draftOnly || typeof runManuscript === 'function', '请在夜航配置文字与读图 API 后编写逐页稿', 409);
      const candidates = p.artifacts.filter(a=>a.visual?.candidate);
      const directions=p.mode==='collab' ? [p.choice] : p.directions;
      const selections=input.candidateIds;
      const reason=input.overrideReason;
      check(reason===undefined || (typeof reason==='string' && reason.length<=4000),'采用说明无效');
      let selected;
      if (selections!==undefined) {
        check(Array.isArray(selections) && selections.length===directions.length && selections.every(id=>typeof id==='string'),'每个方向各选一张主视觉');
        selected=selections.map(id=>candidates.find(a=>a.storageKey===id));
        check(selected.every(Boolean) && directions.every(d=>selected.filter(a=>a.visual.direction===d).length===1),'只能选择当前各方向的候选稿',409);
        check(selected.every(a=>a.visual.recommended) || reason?.trim(),'采用非推荐稿时请写明理由');
      } else {
        selected=p.artifacts.filter(a=>a.stage==='visual' && a.kind==='image' && !['reference','comparison','slogan-original'].includes(a.visual?.role) && (!candidates.length || a.visual?.recommended));
        check(!candidates.length || directions.every(d=>selected.some(a=>a.visual.direction===d)),'请为每个方向选择图稿并说明采用理由',409);
      }
      const chosen=selected.map(a=>a.storageKey);
      check(chosen.length, '没有图稿可采用', 409);
      const files = parseAttachments(attachments, [...p.attachments, ...p.artifacts], 'layout');
      p.visualAdoption = { at: now(), artifacts: chosen, ...(reason?.trim() ? {overrideReason:reason.trim()} : {}),
        materials: files.map(f => storeFile(p, f.name, f.bytes, 'attachment')) };
      if (input.draftOnly) p.layoutDraftOnly = true;
      else delete p.layoutDraftOnly;
      if (input.materialsOnly) p.layoutMaterialsOnly = true;
      else delete p.layoutMaterialsOnly;
      if (typeof runManuscript==='function' && !input.draftOnly) p.layoutFromManuscript=true;
      else delete p.layoutFromManuscript;
      note(p, p.layoutMaterialsOnly ? '用户采用本版视觉稿，整理同版编稿材料' :
        p.layoutDraftOnly ? '用户采用本版视觉稿，整理同版材料并编写逐页稿' :
        p.layoutFromManuscript ? '用户采用本版视觉稿，编写逐页稿后直接排版' : '用户采用本版视觉稿，继续本地排版');
      p.stage = 'layout';
      p.status = 'running';
    } else if (kind === 'render_manuscript') {
      check(p.stage==='layout' && p.status==='waiting' && p.layoutDraftOnly && !p.layoutMaterialsOnly &&
        manuscriptArtifact(p.artifacts),'当前没有可排版的本版逐页稿',409);
      delete p.layoutDraftOnly;
      p.layoutFromManuscript=true;
      p.status='running';
      note(p,'用户确认本版逐页稿，开始排版');
    } else if (kind === 'research_digest') {
      check(!p.claim && p.stage === 'research' && p.status === 'waiting' && p.research?.ready && !p.research.sections,'没有等待交接的已核研究结果',409);
      p.researchDigestOnly = true;
      p.status = 'running';
      note(p,'开始从当前已核研究发现重新编辑摘要');
    } else if (kind === 'research_continue') {
      check(p.mode!=='auto' || !automaticResearchGaps(p.research,p).length,'研究依据未齐，须先补查',409);
      const conditional = canRequestStrategy(p);
      check(!p.claim && (conditional || (p.stage === 'research' && p.status === 'waiting' && p.research?.ready && !p.research.digestPending && p.researchOnly)),
        '没有等待交接的研究成果', 409);
      if (conditional && p.research.strategyReturned) {
        const previous=p.versions.findLast(v=>v.stage==='strategy' && v.research)?.research;
        archiveVersion(p);
        p.research={...p.research,strategyReturned:false,next:previous?.next || ''};
      }
      if (conditional) p.research.conditional = true;
      p.researchOnly = false;
      p.stage = 'strategy';
      p.status = 'running';
      note(p, conditional ? '带已核发现和未决问题进入策略，开始撰写策略' : '已确认查看研究结果，继续策略');
    } else if (kind === 'research_again') {
      check(
        !p.claim &&
          p.status !== 'running' &&
          p.stage !== 'brief' &&
          p.artifacts.some((a) => a.stage === 'brief'),
        '当前无法从研究重新开始，请在本次运行结束后查看',
        409,
      );
      const continuing = p.stage === 'research' && !p.research?.ready && (p.status === 'waiting' || p.researchFollowup === true);
      const question = p.research?.question;
      if (continuing && question) check(text, '请回答研究问题，或选择按现有条件继续', 400);
      archiveVersion(p);
      p.researchQuestionAnswered = Boolean(continuing && (question || p.researchQuestionAnswered));
      p.researchFollowup = continuing;
      p.researchOnly = input.researchOnly === true;
      p.artifacts = p.artifacts.filter((a) => a.stage === 'brief');
      p.stage = 'research';
      p.status = 'running';
      p.error = null;
      p.research = null;
      p.copyReview = null; delete p.copyHandoff;
      p.layoutChanges=[]; p.visualRevisions=0; delete p.finalReturn; delete p.finalReview;
      p.directions = [];
      p.choice = null;
      p.visualAdoption = null;
      delete p.layoutDraftOnly;
      delete p.layoutMaterialsOnly;
      delete p.layoutFromManuscript;
      for (const stage of stages.slice(1)) bumpVersion(p,stage);
      if (text)
        p.feedback.push({
          version:p.stageVersions.research,
          at: now(),
          stage: 'research',
          text,
          ...(continuing && question ? { question } : {}),
        });
      note(p, '已保存前版，沿用原简报重新研究' + (text ? '：' + text.slice(0, 180) : ''));
    } else if (kind === 'accept_final') {
      const review=p.finalReview;
      const current=p.artifacts.findLast(a=>a.stage==='layout' && a.kind==='pptx');
      check(p.stage==='final' && p.status==='waiting' && !p.claim && review?.protocol===finalProtocol &&
        review.outcome==='ready' && current?.name===review.pptx &&
        hash(readFileSync(disk(p,current.storageKey)))===review.sha256,'当前精修版未满足验收条件',409);
      review.acceptedAt=now();
      p.status='done';
      note(p,'提案人已验收本版精修 PPTX');
    } else if (kind === 'retry') {
      check(p.status === 'failed' || (p.status==='waiting' && p.finalReturn), '当前阶段无需重试', 409);
      if (p.finalReturn && p.stage==='visual') {
        check((p.visualRevisions || 0)<3,'视觉修改已达三次',409);
        p.visualRevisions=(p.visualRevisions || 0)+1;
      }
      delete p.finalReturn;
      p.status = 'running';
      p.error = null;
      note(p, '用户重试当前阶段');
    } else if (kind === 'message') {
      check(p.status!=='running','当前阶段运行中，请在完成后发送修改意见',409);
      const reviseStrategy=input.targetStage==='strategy' && stages.indexOf(p.stage)>stages.indexOf('strategy') && p.artifacts.some(a=>a.stage==='strategy');
      const caseB=p.stage==='final' && p.status==='waiting' && p.finalReview?.protocol===finalProtocol;
      const target=p.status==='done' || reviseStrategy || caseB ? input.targetStage ?? 'layout' : p.stage;
      check(stages.includes(target) && (!input.targetStage || input.targetStage===target),'返工阶段无效');
      const visual=target==='visual';
      check(!visual || (p.visualRevisions || 0)<3,'视觉修改已达三次，请先确认现有稿件',409);
      check(!visual || p.attachments.length + attachments.length <= 32,'视觉资料累计最多 32 个附件');
      const files=parseAttachments(attachments,[...p.artifacts,...p.attachments],visual ? 'visual' : 'project');
      check(text || files.length,'请输入意见或添加文件');
      p.attachments.push(...files.map(f=>({...storeFile(p,f.name,f.bytes,'attachment'),
        ...(visual && /\.(png|jpe?g)$/i.test(f.name) ? {visualOnly:true} : {})})));
      revise(p,target,text);
      if (visual) p.visualRevisions=(p.visualRevisions || 0)+1;
      p.status='running';
      note(p,'已保存前版，按意见修改'+labels[stages.indexOf(target)]);
    } else check(false, '未知操作');
    if (opId) p.commands[opId] = commandHash;
    save(p);
    if (p.status === 'running') schedule(p.id);
    return p;
  }
  async function handle(req, res) {
    const send = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    try {
      const host = req.headers.host ?? '';
      check(
        /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) &&
          ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress),
        '仅限本机使用',
        403,
      );
      if (req.method === 'POST')
        check(req.headers.origin === 'http://' + host, '请求必须来自当前工作台', 403);
      const parts = new URL(req.url, 'http://' + host).pathname.split('/').filter(Boolean);
      if (parts[0] === 'api' && parts[1] === 'library') {
        await libraryRequest({db,req,res,parts,send,body,filename,check,randomUUID});
        return;
      }
      check(parts[0] === 'api' && parts[1] === 'projects', '接口不存在', 404);
      if (parts.length === 2 && req.method === 'GET') {
        send(200, { projects: list() });
        return;
      }
      if (parts.length === 2 && req.method === 'POST') {
        send(201, { project: view(create(await body(req))) });
        return;
      }
      const input = req.method === 'POST' ? await body(req) : null;
      const p = get(parts[2]);
      check(p, '项目不存在', 404);
      if (parts.length === 3 && req.method === 'GET') {
        send(200, { project: view(p) });
        return;
      }
      if (parts.length === 4 && parts[3] === 'action' && req.method === 'POST') {
        send(200, { project: view(action(p, input)) });
        return;
      }
      if (parts.length === 5 && parts[3] === 'files' && req.method === 'GET') {
        const a = [...p.artifacts, ...p.attachments, ...(p.visualAdoption?.materials ?? []), ...p.versions.flatMap(v => [...v.artifacts, ...(v.visualAdoption?.materials ?? [])])].find(
          (x) => x.storageKey === parts[4],
        );
        check(a, '文件不存在', 404);
        const type = mime[extname(a.name).toLowerCase()] ?? 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': type,
          'Content-Disposition':
            (a.kind === 'image' ? 'inline' : 'attachment') +
            "; filename*=UTF-8''" +
            encodeURIComponent(a.name),
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Cache-Control': 'no-store',
        });
        await pipeline(createReadStream(disk(p, a.storageKey)), res);
        return;
      }
      check(false, '接口不存在', 404);
    } catch (error) {
      if (!res.headersSent)
        send(error.status ?? 500, {
          error: error.status ? error.message : '本地服务未能处理请求，请检查服务日志',
        });
      if (!error.status) console.error(error);
    }
  }
  return {
    handle,
    close() {
      closing = true;
      for (const abort of jobs.values()) abort.abort();
      if (!jobs.size) { db.close(); lease.close(); }
    },
  };
}
