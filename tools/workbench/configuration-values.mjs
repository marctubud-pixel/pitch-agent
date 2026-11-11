export class ConfigurationError extends Error {
  constructor(code, pointer = '/') { super(`${code} at ${pointer}`); this.code = code; this.pointer = pointer; }
}
export function configNeed(value, pointer, code = 'INVALID_CONFIGURATION') { if (!value) throw new ConfigurationError(code, pointer); }
export function configFields(value, fields, pointer = '/') {
  configNeed(value !== null && typeof value === 'object' && !Array.isArray(value), pointer);
  configNeed(Object.keys(value).every(key => fields.includes(key)), pointer, 'UNKNOWN_CONFIGURATION_FIELD');
  return value;
}
export const configText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 10000 && !value.includes('\0');
export const configPositive = value => Number.isSafeInteger(value) && value > 0;
export const configDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function configAllowance(value, pointer, fields = ['maxCalls','origin','version']) {
  configFields(value, fields, pointer);
  for (const key of fields.filter(k => /^(max|previousMax)/.test(k))) if (Object.hasOwn(value,key)) configNeed(configPositive(value[key]), `${pointer}/${key}`);
  for (const key of ['origin','version']) configNeed(configText(value[key]), `${pointer}/${key}`);
}
export function configEvidence(cap, pointer, additionalFields=[]) {
  configFields(cap, ['operation','packetVersion','origin','version','status','maxImages','maxBytes','maxPixels','assignment','limitations','evidence','reportedModel',...additionalFields], pointer);
  configFields(cap.assignment, ['providerId','model'], `${pointer}/assignment`);
  configNeed(['providerId','model'].every(k => configText(cap.assignment[k])), `${pointer}/assignment`);
  configNeed(Array.isArray(cap.limitations) && cap.limitations.length > 0 && cap.limitations.every(configText), `${pointer}/limitations`);
  if (cap.evidence !== undefined) {
    configNeed(Array.isArray(cap.evidence), `${pointer}/evidence`);
    for (const item of cap.evidence) { configFields(item,['path','sha256'],`${pointer}/evidence`); configNeed(configText(item.path)&&configDigest(item.sha256),`${pointer}/evidence`); }
  }
}
