import {createHash} from 'node:crypto';

export const SOURCE_USES = ['audience', 'category', 'competitor', 'cultural', 'production', 'unclassified'];
const MAX_BYTES = 128 * 1024;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => { throw Object.assign(new Error(message), {code: 'SOURCE_ENTRY_INVALID'}); };
export function validateSourceInput(value) {
  const keys = ['title', 'publisher', 'url', 'excerpt', 'intendedUse', 'attachToClaimId'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('Exact source input required');
  for (const key of ['title', 'publisher', 'excerpt']) if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 20000) fail(`${key} must be a nonempty string of at most 20000 characters`);
  if (typeof value.url !== 'string' || value.url.length > 20000) fail('url must be an optional bounded HTTP(S) locator');
  if (value.url) {
    let url; try { url = new URL(value.url); } catch { fail('Invalid source URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('Source URL must use HTTP(S) without credentials');
  }
  if (!SOURCE_USES.includes(value.intendedUse)) fail('Unknown source intendedUse');
  if (value.attachToClaimId !== null) fail('Attaching a source to an existing claim is not connected; no source was saved');
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) fail('Source input exceeds 128 KiB');
  return structuredClone(value);
}
export function registerSource(project, command, context) {
  const input = validateSourceInput(command.source);
  const id = `source-${hash([project.id, command.commandId])}`;
  const data = {id, taskCardId: project.activeTaskCardId, ...input, verificationStatus: 'unverified', provenance: 'user_provided', createdAt: context.now, addedBy: context.actorId};
  return {...data, recordHash: hash(data)};
}
export function registeredSources(project, ids, origin) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string')) fail('Choose 1 to 200 unique registered source IDs');
  const records = ids.map(id => {
    const source = (project.sourceEntries ?? []).find(entry => entry.id === id);
    if (!source || source.taskCardId !== project.activeTaskCardId) fail('Source must be registered for the current task card');
    const {recordHash, ...data} = source;
    if (recordHash !== hash(data)) fail('Registered source content changed');
    return {id, url: source.url || `${origin}/api/projects/${encodeURIComponent(project.id)}/sources/${encodeURIComponent(id)}/content`, text: source.excerpt,
      scopeRelation: 'background', verification: 'captured', title: source.title, publisher: source.publisher, intendedUse: source.intendedUse,
      reason: 'User-provided text, not independently retrieved or authenticated. Intended use does not establish factual support or same-use eligibility.',
      provenance: {kind: 'user_provided', projectId: project.id, taskCardId: source.taskCardId, sourceEntryId: id, sourceEntryHash: recordHash, originalUrl: source.url}};
  });
  if (Buffer.byteLength(JSON.stringify(records)) > MAX_BYTES) fail('Selected source text exceeds 128 KiB; no sources were omitted or truncated');
  return records;
}
