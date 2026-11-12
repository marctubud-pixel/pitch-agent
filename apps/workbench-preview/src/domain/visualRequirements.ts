import {ServiceError} from './service';
export type VisualRequirementKind = 'packaging' | 'kv' | 'adaptation';
export interface VisualRequirement {kind: VisualRequirementKind; views: string[]}
export function parseVisualRequirements(value: unknown): VisualRequirement[] | undefined {
  if(value === undefined)return undefined;
  const invalid = () => new ServiceError('validation', '视觉成果与视图要求无效：每类填写1至12个不重复视图，每项最多120字。');
  if(!Array.isArray(value) || value.length > 3)throw invalid();
  const kinds = new Set<string>();
  return value.map((item: unknown) => {
    if(!item || typeof item !== 'object' || !('kind' in item) || !('views' in item) || Object.keys(item).sort().join(',') !== 'kind,views')throw invalid();
    const {kind, views} = item;
    if(kind !== 'packaging' && kind !== 'kv' && kind !== 'adaptation' || kinds.has(kind) || !Array.isArray(views) || views.length > 12 || views.some(v => typeof v !== 'string'))throw invalid();
    kinds.add(kind);
    const normalized: string[] = views.map(v => String(v).trim()).filter(Boolean);
    if(!normalized.length || normalized.some(v => v.length > 120) || new Set(normalized).size !== normalized.length)throw invalid();
    return {kind, views: normalized};
  });
}
export const visualRequirementText = (value: VisualRequirement[] | undefined) => value?.map(r => `${r.kind === 'packaging' ? '包装' : r.kind === 'kv' ? '主视觉 / 海报' : '延展'}：${r.views.join('、')}`).join('\n') ?? '';
