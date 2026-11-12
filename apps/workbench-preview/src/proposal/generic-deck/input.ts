/** Preparation candidate only. Structural/hash inspection never admits a business source. */
export type Sha256 = string & { readonly __brand: 'Sha256' };
export type Method = { id: 'design-research-lead'; version: 'r7-20261109'; sha256: Sha256 };
export type Original = { identity: string; sha256: Sha256; bytes: number; originalText: string };
export type Stage = 'brief' | 'research' | 'strategy' | 'copy' | 'visual';
export type Source = { artifactId: string; projectId: string; taskCardId: string; original: Original };
export type ImageDescriptor = {
  imageId: string; directionId: string; targetId: string; kind: 'packaging' | 'kv' | 'adaptation'; requiredViews: string[];
  visualArtifactId: string; visualContentHash: Sha256;
  originalLocator: string; sha256: Sha256; bytes: number; mediaType: 'image/png' | 'image/jpeg'; width: number; height: number;
};
export type Relation =
  | { kind: 'illustrative'; statement: string; source: { stage: Stage; location: string; quote: string } }
  | { kind: 'not_supplied' };
export type ProposalDeckInputV2 = {
  protocol: 'proposal-deck-input-v2'; projectId: string; taskCardId: string; policyVersion: number;
  proposalType: 'packaging' | 'kv'; researchMethod: Method;
  sources: Record<Stage, Source | null>; directionIds: [string, string, string];
  images: ImageDescriptor[]; visualRequirements: { kind: 'packaging' | 'kv' | 'adaptation'; views: string[] }[]; prelayoutCheck: Original | null; relation: Relation;
};
export type Gap = { code: 'missing_source' | 'missing_image' | 'missing_prelayout_check'; target: string };
export type Inspection = {
  input: ProposalDeckInputV2; inputSha256: Sha256;
  admission: 'requires-native-source-receiver'; mediaBytes: 'not_read';
} & ({ kind: 'incomplete'; gaps: Gap[] } | { kind: 'descriptors_checked'; gaps: [] });
class ContractError extends Error {
  readonly code: string;
  readonly target: string;
  constructor(code: string, target: string) { super(`${code}: ${target}`); this.code = code; this.target = target; }
}
const fail = (code: string, target: string): never => { throw new ContractError(code, target); };
const encoder = new TextEncoder();
export function isSha256(value: unknown): value is Sha256 { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function sha(value: unknown): Sha256 { return isSha256(value) ? value : fail('invalid_sha256', 'sha256'); }
export async function hashBytes(bytes: Uint8Array): Promise<Sha256> {
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer));
  return sha(Array.from(result, b => b.toString(16).padStart(2, '0')).join(''));
}
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('invalid_object', fields.join(','));
  const row = Object.fromEntries(Object.entries(value));
  if (Object.keys(row).length !== fields.length || fields.some(k => !Object.hasOwn(row, k))) return fail('unexpected_fields', fields.join(','));
  return row;
}
function text(value: unknown): string { return typeof value === 'string' && value.trim() && value.length <= 2048 ? value : fail('invalid_text', 'text'); }
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max ? value : fail('invalid_integer', 'integer'); }
function member<T extends string>(value: unknown, choices: readonly T[]): T { for (const choice of choices) if (choice === value) return choice; return fail('invalid_member', choices.join('|')); }
async function original(value: unknown): Promise<Original> {
  const r = object(value, ['identity', 'sha256', 'bytes', 'originalText']);
  const identity = text(r.identity), digest = sha(r.sha256), bytes = integer(r.bytes, 8 * 1024 * 1024);
  if (typeof r.originalText !== 'string' || !r.originalText.trim() || r.originalText.length > 8 * 1024 * 1024) return fail('invalid_original', identity);
  const raw = encoder.encode(r.originalText);
  if (raw.byteLength !== bytes || await hashBytes(raw) !== digest) return fail('original_bytes_changed', identity);
  // Preserve literal JSON bytes. Full business schemas are validated by the native receiver.
  try { JSON.parse(r.originalText); } catch { return fail('invalid_json_original', identity); }
  return { identity, sha256: digest, bytes, originalText: r.originalText };
}
async function source(value: unknown, projectId: string, taskCardId: string): Promise<Source | null> {
  if (value === null) return null;
  const r = object(value, ['artifactId', 'projectId', 'taskCardId', 'original']);
  if (r.projectId !== projectId || r.taskCardId !== taskCardId) return fail('source_identity_mismatch', text(r.artifactId));
  return { artifactId: text(r.artifactId), projectId, taskCardId, original: await original(r.original) };
}
function method(value: unknown): Method {
  const r = object(value, ['id', 'version', 'sha256']);
  return { id: member(r.id, ['design-research-lead']), version: member(r.version, ['r7-20261109']), sha256: sha(r.sha256) };
}
const stages: Stage[] = ['brief', 'research', 'strategy', 'copy', 'visual'];
function media(value: unknown, directionIds: string[], visual: Source | null): ImageDescriptor {
  const r=object(value,['imageId','directionId','targetId','kind','requiredViews','visualArtifactId','visualContentHash','originalLocator','sha256','bytes','mediaType','width','height']);
  const imageId=text(r.imageId),directionId=text(r.directionId),visualArtifactId=text(r.visualArtifactId),visualContentHash=sha(r.visualContentHash);
  if(!directionIds.includes(directionId)||!visual||visualArtifactId!==visual.artifactId||visualContentHash!==visual.original.sha256)return fail('media_source_mismatch',imageId);
  const requiredViews=viewList(r.requiredViews),width=integer(r.width,32768),height=integer(r.height,32768);if(width*height>20_000_000)return fail('media_pixels_exceeded',imageId);
  return {imageId,directionId,targetId:text(r.targetId),kind:member(r.kind,['packaging','kv','adaptation']),requiredViews,visualArtifactId,visualContentHash,originalLocator:text(r.originalLocator),sha256:sha(r.sha256),bytes:integer(r.bytes,8*1024*1024),mediaType:member(r.mediaType,['image/png','image/jpeg']),width,height};
}
function viewList(value:unknown):string[]{if(!Array.isArray(value)||!value.length||value.length>12)return fail('invalid_views','views');const views=value.map(text);if(new Set(views).size!==views.length)return fail('duplicate_views','views');return views;}
function requirements(value:unknown){if(!Array.isArray(value)||!value.length||value.length>3)return fail('typed_views_required','visualRequirements');const result=value.map(value=>{const r=object(value,['kind','views']);return {kind:member(r.kind,['packaging','kv','adaptation']),views:viewList(r.views)};});if(new Set(result.map(r=>r.kind)).size!==result.length)return fail('duplicate_kind','visualRequirements');return result;}

function sourceQuote(value: unknown, sources: Record<Stage, Source | null>) {
  const r = object(value, ['stage', 'location', 'quote']), stage = member(r.stage, stages), location = text(r.location), quote = text(r.quote);
  if (!location.startsWith('/') || /~(?![01])/.test(location)) return fail('invalid_source_location', location);
  const original = sources[stage]?.original;
  if (!original) return fail('missing_relation_source', stage);
  let leaf: unknown = JSON.parse(original.originalText);
  for (const token of location.slice(1).split('/')) {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!leaf || typeof leaf !== 'object' || !Object.hasOwn(leaf, key)) return fail('missing_relation_quote', location);
    leaf = Object.fromEntries(Object.entries(leaf))[key];
  }
  if (typeof leaf !== 'string' || !leaf.includes(quote)) return fail('missing_relation_quote', location);
  return { stage, location, quote };
}
function relation(value: unknown, sources: Record<Stage, Source | null>): Relation {
  if (!value || typeof value !== 'object' || !('kind' in value)) return fail('invalid_relation', 'relation');
  if (value.kind === 'not_supplied') { object(value, ['kind']); return { kind: 'not_supplied' }; }
  const r = object(value, ['kind', 'statement', 'source']);
  if (r.kind !== 'illustrative') return fail('invalid_relation', 'kind');
  const source = sourceQuote(r.source, sources), statement = text(r.statement);
  if (statement !== source.quote) return fail('relation_rewrites_source', source.location);
  return { kind: 'illustrative', statement, source };
}
export async function inspectProposalDeckInput(value: unknown, expectedResearchMethod: Method): Promise<Inspection> {
  const r = object(value, ['protocol', 'projectId', 'taskCardId', 'policyVersion', 'proposalType', 'researchMethod', 'sources', 'directionIds', 'images', 'visualRequirements', 'prelayoutCheck', 'relation']);
  const protocol = member(r.protocol, ['proposal-deck-input-v2']), projectId = text(r.projectId), taskCardId = text(r.taskCardId);
  const researchMethod = method(r.researchMethod), expected = method(expectedResearchMethod);
  if (researchMethod.sha256 !== expected.sha256) return fail('research_method_changed', researchMethod.id);
  const s = object(r.sources, stages);
  const sources = { brief: await source(s.brief, projectId, taskCardId), research: await source(s.research, projectId, taskCardId), strategy: await source(s.strategy, projectId, taskCardId), copy: await source(s.copy, projectId, taskCardId), visual: await source(s.visual, projectId, taskCardId) };
  if (!Array.isArray(r.directionIds) || r.directionIds.length !== 3) return fail('three_directions_required', 'directionIds');
  const directionIds: [string, string, string] = [text(r.directionIds[0]), text(r.directionIds[1]), text(r.directionIds[2])];
  if (new Set(directionIds).size !== 3) return fail('duplicate_direction', 'directionIds');
  if (!Array.isArray(r.images) || r.images.length > 512) return fail('invalid_media_inventory', 'images');
  const images = r.images.map(v => media(v, directionIds, sources.visual));
  if (new Set(images.map(i => i.imageId)).size !== images.length || new Set(images.map(i => `${i.directionId}/${i.targetId}`)).size !== images.length) return fail('duplicate_media', 'images');
  const input: ProposalDeckInputV2 = { protocol, projectId, taskCardId, policyVersion: integer(r.policyVersion), proposalType: member(r.proposalType, ['packaging', 'kv']), researchMethod, sources, directionIds, images, visualRequirements:requirements(r.visualRequirements),
    prelayoutCheck: r.prelayoutCheck === null ? null : await original(r.prelayoutCheck), relation: relation(r.relation, sources) };
  const gaps: Gap[] = stages.filter(stage => !sources[stage]).map(stage => ({ code: 'missing_source', target: stage }));
  for(const id of directionIds)for(const requirement of input.visualRequirements)if(!images.some(i=>i.directionId===id&&i.kind===requirement.kind&&requirement.views.every(v=>i.requiredViews.includes(v))))gaps.push({code:'missing_image',target:`${id}/${requirement.kind}/${requirement.views.join(',')}`});
  if (!input.prelayoutCheck) gaps.push({ code: 'missing_prelayout_check', target: 'prelayoutCheck' });
  const checked = { input, inputSha256: await hashBytes(encoder.encode(JSON.stringify(input))), admission: 'requires-native-source-receiver', mediaBytes: 'not_read' } satisfies Omit<Inspection, 'kind' | 'gaps'>;
  return gaps.length ? { ...checked, kind: 'incomplete', gaps } : { ...checked, kind: 'descriptors_checked', gaps: [] };
}
/** Only verifies supplied bytes; no file/network reads and no image transcoding. */
export async function verifyImageByteIdentity(descriptor: ImageDescriptor, bytes: Uint8Array): Promise<void> {
  const snapshot = Uint8Array.from(bytes);
  if (snapshot.byteLength !== descriptor.bytes || await hashBytes(snapshot) !== descriptor.sha256) return fail('media_bytes_changed', descriptor.imageId);
  if(descriptor.mediaType==='image/jpeg'){let found=false;for(let i=2;i+9<snapshot.length;){if(snapshot[i++]!==255)continue;let marker=snapshot[i++];while(marker===255)marker=snapshot[i++];if(marker===217||marker===218)break;if(marker===216||marker===1||marker>=208&&marker<=215)continue;const size=snapshot[i]*256+snapshot[i+1];if(size<2||i+size>snapshot.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){found=snapshot[i+3]*256+snapshot[i+4]===descriptor.height&&snapshot[i+5]*256+snapshot[i+6]===descriptor.width;break;}i+=size;}if(snapshot[0]!==255||snapshot[1]!==216||!found)return fail('invalid_jpeg_header',descriptor.imageId);return;}
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (snapshot.length < 33 || signature.some((b, i) => snapshot[i] !== b) || new TextDecoder().decode(snapshot.slice(12, 16)) !== 'IHDR') return fail('invalid_png_header', descriptor.imageId);
  const view = new DataView(snapshot.buffer);
  if (view.getUint32(8) !== 13 || view.getUint32(16) !== descriptor.width || view.getUint32(20) !== descriptor.height) return fail('media_dimensions_changed', descriptor.imageId);
  // Decode/CRC/resource suitability remain the existing image readback/native receiver's duty.
}
