import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const base = new URL('../../skills/design-research-lead/', import.meta.url);
const paths = ['SKILL.md', 'references/contracts.md', 'references/task-methods.md', 'references/analysis-models.md', 'references/reference-judgment.md', 'references/review.md', 'references/reader-loop.md', 'references/visual-boards.md', 'references/layout-templates.md'];
const hash = text => createHash('sha256').update(text).digest('hex');
export function researchMethod() {
  const documents = paths.map(path => ({path, text: readFileSync(new URL(path, base), 'utf8')}));
  return {id: 'design-research-lead', version: 'r7-20261109', sha256: hash(JSON.stringify(documents)), documents};
}
export function researchMethodIdentity() {
  const {id, version, sha256} = researchMethod();
  return {id, version, sha256};
}
export function applyResearchMethod(request, identity) {
  const method = researchMethod();
  if (!identity || Object.keys(identity).sort().join(',') !== 'id,sha256,version' || identity.id !== method.id || identity.version !== method.version || identity.sha256 !== method.sha256) throw Object.assign(new Error('固定研究方法已改变，原任务需重新核对。'), {code: 'RESEARCH_METHOD_CHANGED'});
  return {...request, prompt: `PROJECT_RESEARCH_METHOD ${method.version} ${method.sha256}\n${method.documents.map(d => `METHOD_DOCUMENT ${d.path}\n${d.text}`).join('\n\n')}\nEND_PROJECT_RESEARCH_METHOD\n\n${request.prompt}`};
}
