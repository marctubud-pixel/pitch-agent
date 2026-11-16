import {validateResearchDigest} from './research-digest.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  createReadStream,
  mkdirSync,
  mkdtempSync,
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
import { headlineMarkdown, headlineProtocol, validSingleReview } from './copy-review.mjs';

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
    research: p.research ?? null,
    directions: p.directions,
    copyReview: p.copyReview ?? null,
    choice: p.choice,
    visualAdoption: p.visualAdoption ?? null,
  });
}

// This gate is used only when accepting a new run. Historical tickets keep their original shape.
function copyHandoffReady(review, names, text) {
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
  const gaps = Array.isArray(report?.gaps) ? report.gaps.filter(text) : [];
  const ready = report?.ready === true && findings.length > 0 && findings.length === report.findings.length;
  if (!ready && !gaps.length) gaps.push('当前材料尚未提供可供策略使用的研究判断。');
  return {
    ready,
    ...(text(report?.methodVersion) ? { methodVersion: report.methodVersion } : {}),
    findings,
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
function continueResearch(p) {
  if (p.research.question || p.researchFollowup) {
    p.status = 'waiting';
    note(p, p.research.question || '定向补查后仍缺关键依据：' + p.research.next);
    return;
  }
  archiveVersion(p);
  p.artifacts = p.artifacts.filter((a) => a.stage === 'brief');
  p.researchFollowup = true;
  p.status = 'running';
  note(p, '按研究缺口开始定向补查：' + p.research.next);
}

function publicView(p) {
  const { owner, claim, inputHash, commands, ...visible } = p;
  const unstore = ({ storageKey, ...record }) => record;
  return {
    ...visible,
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
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function createNightflight({ root, runStage, runLayout }) {
  root = resolve(root);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(root, 'nightflight.sqlite'));
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL)',
  );
  const get = (id) => {
    const row = db.prepare('SELECT state FROM projects WHERE id=?').get(id);
    return row && JSON.parse(row.state);
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
    check(
      db
        .prepare('UPDATE projects SET revision=?,state=? WHERE id=? AND revision=?')
        .run(p.revision, JSON.stringify(p), p.id, old).changes === 1,
      '项目已更新，请刷新后再试',
      409,
    );
  }
  function disk(p, key) {
    return join(root, p.id, 'files', key);
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
      let claim;
      try {
        while (!closing) {
          const p = get(id);
          if (!p || p.status !== 'running' || p.claim) break;
          claim = randomUUID();
          p.claim = claim;
          p.owner = process.pid;
          note(p, '开始' + labels[stages.indexOf(p.stage)]);
          save(p);
          const dir = mkdtempSync(join(root, id, 'attempt-'));
          const input = publicView(p);
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
              input.previousResearchImages = refs.map(ref=>{
                const file = previous.artifacts.find(a=>a.stage==='research' && a.kind==='image' && a.name===ref.name);
                check(file,'上一版竞品研究图片缺失',422);
                const bytes = readFileSync(disk(p,file.storageKey));
                check(hash(bytes)===ref.sha256,'上一版竞品研究图片发生变化',422);
                const path = join(dir,'previous-'+filename(file.name));
                writeFileSync(path,bytes,{flag:'wx',mode:0o600});
                return {...ref,path,imageId:'ref_'+ref.sha256,byteLength:bytes.length,mediaType:mime[extname(file.name).toLowerCase()]};
              });
            }
          }
          if (p.stage === 'visual') {
            const last = p.versions.at(-1);
            const previous = last?.stage === 'visual' ? last : undefined;
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
              return {visual:a.visual,image:{path,imageId:'previous',sha256:hash(bytes),byteLength:bytes.length,mediaType:'image/png'}};
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
              return { name: record.name, kind: record.kind, stage: record.stage, text: record.text, visual:record.visual, visualOnly:record.visualOnly, path };
            });
          }
          const onEvent = (text) => {
            const live = get(id);
            if (live?.claim === claim && typeof text === 'string' && text.trim()) {
              note(live, text.slice(0, 500));
              save(live);
            }
          };
          const result = await (p.stage === 'layout' ? runLayout : runStage)({
            stage: p.stage,
            project: input,
            dir,
            onEvent,
            signal: abort.signal,
          });
          const live = get(id);
          check(live?.claim === claim, '该次运行已结束', 409);
          if (p.researchDigestOnly) {
            const digest = validateResearchDigest(result.researchDigest,live.research.findings);
            archiveVersion(live);
            live.research = {...live.research,digest};
            delete live.researchDigestOnly;
            delete live.research.digestPending;
            if (p.researchOnly) live.status = 'waiting';
            else live.stage = 'strategy';
            live.error = null;
            live.claim = null;
            live.owner = null;
            note(live,'已从本版核实发现编辑研究摘要');
            save(live);
            claim = null;
            continue;
          }
          check(Array.isArray(result.artifacts) && result.artifacts.length, '这一阶段没有交回文件', 422);
          if (p.stage === 'copy') {
            const names = result.directions;
            const review = result.copyReview;
            const text = result.artifacts.find((a) => a.kind === 'text' && typeof a.text === 'string')?.text;
            check(Array.isArray(names) && names.length === 3 && names.every((d) => typeof d === 'string' && d.trim())
              && new Set(names).size === 3, '文案未交回三个不同方向', 422);
            check(copyHandoffReady(review, names, text), '本版文案尚无完整的双团记录、单案或整组裁定，不能交接', 422);
            live.directions = names;
            live.copyReview = review;
          }
          if (p.stage === 'visual') {
            const expected = p.mode==='collab' ? [p.choice] : p.directions;
            for (const ref of result.artifacts.filter(a => a.visual?.role === 'reference')) {
              const v = ref.visual;
              check(ref.kind === 'image' && /\.(?:png|jpe?g)$/i.test(ref.name) && expected.includes(v.direction) &&
                /^[a-f0-9]{64}$/.test(v.sha256) && [v.pageUrl,v.sourceUrl].every(url => URL.canParse(url) && new URL(url).protocol === 'https:') &&
                typeof v.query === 'string' && v.query.trim() && !v.candidate && !v.recommended, '公开参考图来源或方向记录无效', 422);
            }
            const images = result.artifacts.filter(a=>a.kind==='image' && !['comparison','reference'].includes(a.visual?.role));
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
          const occupied = new Set(
            [...live.attachments, ...live.artifacts].map((a) => a.name.normalize('NFC').toLowerCase()),
          );
          const outputs = result.artifacts.map((a) => {
            const name = filename(a.name),
              key = name.normalize('NFC').toLowerCase();
            check(!occupied.has(key), '产物文件名重复：' + name, 422);
            occupied.add(key);
            check(['image', 'pptx', 'text'].includes(a.kind), '产物类型无效', 422);
            return {
              ...storeFile(live, name, join(dir, name), a.kind),
              stage: p.stage,
              ...(p.stage === 'visual' && a.visual ? {visual:a.visual} : {}),
              ...(typeof a.text === 'string' ? { text: a.text } : {}),
            };
          });
          for (const ref of outputs.filter(file => file.visual?.role === 'reference')) {
            check(hash(readFileSync(disk(live, ref.storageKey))) === ref.visual.sha256, '公开参考原件与来源记录不一致', 422);
          }
          if (p.stage === 'research') {
            for (const ref of result.research?.findings?.flatMap(f=>f.images ?? []) ?? []) {
              const file = outputs.find(a=>a.kind==='image' && a.name===ref.name);
              check(file && [ref.sourceUrl,ref.pageUrl].every(url=>URL.canParse(url) && new URL(url).protocol==='https:') &&
                ref.observation?.trim() && ref.title?.trim() && hash(readFileSync(disk(live,file.storageKey)))===ref.sha256,
                '竞品观察需要本轮原图、来源和匹配的图片哈希',422);
            }
          }
          live.artifacts.push(...outputs);
          live.claim = null;
          live.owner = null;
          note(live, '已保存' + outputs.length + '份' + labels[stages.indexOf(p.stage)] + '产物');
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
          } else if (p.stage === 'strategy' && result.researchReturn) {
            archiveVersion(live);
            live.artifacts = live.artifacts.filter((a) => a.stage !== 'strategy');
            live.stage = 'research';
            live.research = {
              ...researchHandoff(live.research, live),
              ready: false,
              question: '',
              next: result.researchReturn,
            };
            note(live, '策略退回研究：' + result.researchReturn);
            continueResearch(live);
          } else if (p.stage === 'copy' && p.mode === 'collab') {
            live.status = 'waiting';
            note(live, '等待你选择创意方向');
          } else if (p.stage === 'visual') {
            live.status = 'waiting';
            note(live, outputs.some(a=>a.visual?.candidate && !outputs.some(w=>w.visual?.direction===a.visual.direction && w.visual.recommended)) ? '有方向尚无达标主视觉，请查看原因并修改' : '每方向已推荐同批达标最高稿，等待采用');
          } else if (p.stage === 'final') {
            live.status = 'done';
            note(live, '本地试跑完成，可查看核对记录与 PPTX');
          } else live.stage = stages[stages.indexOf(p.stage) + 1];
          save(live);
          claim = null;
        }
      } catch (error) {
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
        }
      } finally {
        jobs.delete(id);
        if (closing) {
          if (!jobs.size) db.close();
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
      let alive = false;
      if (p.owner && p.owner !== process.pid) {
        try {
          process.kill(p.owner, 0);
          alive = true;
        } catch {}
      }
      if (!alive) {
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
    note(p, '已收到需求，开始本地 Codex 试跑');
    db.prepare('INSERT INTO projects VALUES(?,?,?)').run(id, p.revision, JSON.stringify(p));
    schedule(id);
    return p;
  }
  function action(p, input) {
    const { kind, opId } = input,
      text = (input.text ?? '').trim();
    check(typeof text === 'string' && text.length <= 64000, '消息过长');
    const attachments = input.attachments ?? [];
    const commandHash = hash(JSON.stringify([kind, text, attachments, input.expectedRevision, ...(input.researchOnly === true ? [true] : [])]));
    if (opId) {
      check(safeId.test(opId) && !Object.hasOwn(Object.prototype, opId), '动作编号无效');
      if (Object.hasOwn(p.commands, opId)) {
        check(p.commands[opId] === commandHash, '动作编号冲突', 409);
        return p;
      }
    }
    if (kind === 'research_digest' || kind === 'choice' || kind === 'adopt' || kind === 'research_again' || kind === 'research_continue')
      check(input.expectedRevision === p.revision, '项目版本已更新，请查看最新结果再决定', 409);
    if (kind === 'choice') {
      check(
        p.status === 'waiting' && p.stage === 'copy' && p.directions.includes(text),
        '当前方向不可选',
        409,
      );
      p.choice = text;
      note(p, '已选择：' + text);
      p.stage = 'visual';
      p.status = 'running';
    } else if (kind === 'adopt') {
      check(p.status === 'waiting' && p.stage === 'visual', '当前没有待采用的图稿', 409);
      const candidates = p.artifacts.filter(a=>a.visual?.candidate);
      if (candidates.length) check((p.mode==='collab' ? [p.choice] : p.directions).every(d=>candidates.some(a=>a.visual.direction===d && a.visual.recommended)), '本批有方向尚无达标主视觉，请修改后再采用',409);
      const chosen = p.artifacts
        .filter((a) => a.stage === 'visual' && a.kind === 'image' && !['reference','comparison'].includes(a.visual?.role) && (!candidates.length || a.visual?.recommended))
        .map((a) => a.storageKey);
      check(chosen.length, '没有图稿可采用', 409);
      const files = parseAttachments(attachments, [...p.attachments, ...p.artifacts], 'layout');
      p.visualAdoption = { at: now(), artifacts: chosen,
        materials: files.map(f => storeFile(p, f.name, f.bytes, 'attachment')) };
      note(p, '用户采用本版视觉稿，继续本地排版');
      p.stage = 'layout';
      p.status = 'running';
    } else if (kind === 'research_digest') {
      check(!p.claim && p.stage === 'research' && p.status === 'waiting' && p.research?.ready,'没有等待交接的已核研究结果',409);
      p.researchDigestOnly = true;
      p.status = 'running';
      note(p,'开始从当前已核研究发现重新编辑摘要');
    } else if (kind === 'research_continue') {
      check(p.stage === 'research' && p.status === 'waiting' && p.research?.ready && !p.research.digestPending && p.researchOnly,
        '没有等待交接的研究成果', 409);
      p.researchOnly = false;
      p.stage = 'strategy';
      p.status = 'running';
      note(p, '已确认查看研究结果，继续策略');
    } else if (kind === 'research_again') {
      check(
        !p.claim &&
          p.status !== 'running' &&
          p.stage !== 'brief' &&
          p.artifacts.some((a) => a.stage === 'brief'),
        '当前无法从研究重新开始，请在本次运行结束后查看',
        409,
      );
      const continuing = p.stage === 'research' && (p.status === 'waiting' || p.researchFollowup === true);
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
      p.copyReview = null;
      p.directions = [];
      p.choice = null;
      p.visualAdoption = null;
      if (text)
        p.feedback.push({
          at: now(),
          stage: 'research',
          text,
          ...(continuing && question ? { question } : {}),
        });
      note(p, '已保存前版，沿用原简报重新研究' + (text ? '：' + text.slice(0, 180) : ''));
    } else if (kind === 'retry') {
      check(p.status === 'failed', '当前阶段无需重试', 409);
      p.status = 'running';
      p.error = null;
      note(p, '用户重试当前阶段');
    } else if (kind === 'message') {
      const visual = p.stage === 'visual';
      check(!visual || p.attachments.length + attachments.length <= 32, '视觉资料累计最多 32 个附件');
      const files = parseAttachments(attachments, [...p.artifacts, ...p.attachments], visual ? 'visual' : 'project');
      check(text || files.length, '请输入意见或添加文件');
      p.attachments.push(...files.map(f => ({...storeFile(p, f.name, f.bytes, 'attachment'),
        ...(visual && /\.(png|jpe?g)$/i.test(f.name) ? {visualOnly:true} : {})})));
      p.feedback.push({ at: now(), stage: p.stage, text });
      note(p, '收到你的意见：' + text.slice(0, 180));
      if ((p.status === 'waiting' && p.stage === 'visual') || p.status === 'done') {
        const restart = p.status === 'done' ? 'brief' : 'visual';
        archiveVersion(p);
        p.artifacts = p.artifacts.filter((a) => stages.indexOf(a.stage) < stages.indexOf(restart));
        p.stage = restart;
        p.status = 'running';
        p.visualAdoption = null;
        if (restart === 'brief') {
          p.researchFollowup = false;
          p.researchQuestionAnswered = false;
          p.research = null;
          p.copyReview = null;
          p.directions = [];
          p.choice = null;
        }
        note(p, '已保存前版，按修改意见生成新版');
      }
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
      check(parts[0] === 'api' && parts[1] === 'projects', '接口不存在', 404);
      if (parts.length === 2 && req.method === 'GET') {
        send(200, { projects: list() });
        return;
      }
      if (parts.length === 2 && req.method === 'POST') {
        send(201, { project: publicView(create(await body(req))) });
        return;
      }
      const input = req.method === 'POST' ? await body(req) : null;
      const p = get(parts[2]);
      check(p, '项目不存在', 404);
      if (parts.length === 3 && req.method === 'GET') {
        send(200, { project: publicView(p) });
        return;
      }
      if (parts.length === 4 && parts[3] === 'action' && req.method === 'POST') {
        send(200, { project: publicView(action(p, input)) });
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
      if (!jobs.size) db.close();
    },
  };
}
