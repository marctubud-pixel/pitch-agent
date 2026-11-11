/**
 * Structural mapping for arbitrary briefs: when a document has a heading such as "Budget" or a
 * line such as "Timeline: 3 March", the text under it is copied word for word into that field,
 * with the passage linked. Nothing is interpreted or reworded, and no field is filled without a
 * matching heading. This is deliberately not semantic extraction.
 */
import { LIST_FIELDS, TASK_FIELDS, type SourceSpan, type TaskField } from '../../domain/models';

const LABELS: Record<TaskField, string[]> = {
  projectName: ['project name', 'project', 'project title', 'nom du projet', 'nombre del proyecto', 'プロジェクト名', '프로젝트 이름', '项目名称'],
  brand: ['brand', 'product', 'brand or product', 'client', 'marque', 'produit', 'marca', 'producto', 'ブランド', '製品', '브랜드', '제품', '品牌', '产品'],
  background: ['background', 'context', 'about us', 'situation', 'overview', 'contexte', 'contexto', 'antecedentes', '背景', '배경', '概要'],
  objectives: ['objective', 'objectives', 'business objective', 'goals', 'goal', 'aims', 'what we want to achieve', 'objectif', 'objectifs', 'objetivo', 'objetivos', '目標', '目的', '목표', '目标'],
  researchQuestions: ['research questions', 'research question', 'questions to answer', 'questions de recherche', 'preguntas de investigación', 'リサーチクエスチョン', '리서치 질문', '研究问题'],
  audience: ['audience', 'target audience', 'target', 'who it is for', 'customers', 'public', 'public cible', 'público', 'público objetivo', 'ターゲット', 'オーディエンス', '타깃', '오디언스', '目标受众', '受众'],
  deliverableType: ['deliverable type', 'type of deliverable', 'format', 'type de livrable', 'tipo de entregable', '成果物の種類', '산출물 유형', '交付物类型'],
  deliverables: ['deliverables', 'deliverable', 'what we need', 'what we need from you', 'outputs', 'scope', 'livrables', 'entregables', '成果物', '산출물', '交付物'],
  constraints: ['constraints', 'mandatories', 'requirements', 'things to keep in mind', 'limitations', 'contraintes', 'restricciones', '制約', '제약', '제약 사항', '限制', '限制条件'],
  timeline: ['timeline', 'timing', 'timings', 'deadline', 'deadlines', 'schedule', 'calendrier', 'délais', 'plazos', 'calendario', 'スケジュール', '納期', '일정', '마감', '时间', '时间安排', '截止日期'],
  budget: ['budget', 'budgets', 'fee', 'fees', 'cost', 'presupuesto', '予算', '예산', '预算'],
  references: ['references', 'reference materials', 'reference', 'attachments', 'materials', 'références', 'referencias', '参考資料', '참고 자료', '参考资料'],
  openQuestions: ['open questions', 'questions', 'questions we have', 'unknowns', 'questions ouvertes', 'preguntas abiertas', '未解決の質問', '질문', '待解答问题', '问题'],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^[#>*\-\s\d.)]+/, '')
    .replace(/[:：\s]+$/, '')
    .trim();

const LOOKUP = new Map<string, TaskField>();
for (const field of TASK_FIELDS) for (const label of LABELS[field]) LOOKUP.set(label, field);

/** A "Label: value" line whose label is a known field, which also ends the section above it. */
const inlineField = (line: string) => {
  const m = /^([^:：]{2,40})[:：]\s*(.+)$/.exec(line);
  return m ? LOOKUP.get(norm(m[1])) : undefined;
};

export interface HeadingMatch {
  field: TaskField;
  heading: string;
  value: string | string[];
  spans: Array<Omit<SourceSpan, 'attachmentId'>>;
}

interface Line {
  text: string;
  start: number;
}

function lines(text: string): Line[] {
  const out: Line[] = [];
  let start = 0;
  for (const raw of text.split('\n')) {
    out.push({ text: raw, start });
    start += raw.length + 1;
  }
  return out;
}

/** A line that looks like a heading: short, on its own, and not a sentence. */
const looksLikeHeading = (t: string) => {
  const s = t.trim();
  return s.length > 0 && s.length <= 60 && !/[.!?。！？]$/.test(s) && (/^#{1,6}\s/.test(s) || /[:：]$/.test(s) || s === s.toUpperCase() || s.split(/\s+/).length <= 6);
};

export function matchHeadings(text: string): HeadingMatch[] {
  const all = lines(text);
  const found: HeadingMatch[] = [];
  const used = new Set<TaskField>();
  for (let i = 0; i < all.length; i += 1) {
    const line = all[i];
    const trimmed = line.text.trim();
    if (!trimmed) continue;
    // "Label: value" on one line
    const inline = /^([^:：]{2,40})[:：]\s*(.+)$/.exec(trimmed);
    if (inline) {
      const field = LOOKUP.get(norm(inline[1]));
      if (field && !used.has(field)) {
        const offset = line.text.indexOf(inline[2]);
        used.add(field);
        found.push({
          field,
          heading: inline[1].trim(),
          value: LIST_FIELDS.has(field) ? [inline[2].trim()] : inline[2].trim(),
          spans: [{ start: line.start + offset, end: line.start + offset + inline[2].length, quote: inline[2] }],
        });
        continue;
      }
    }
    // "Label" on its own line, then the section until the next heading-like line
    const field = looksLikeHeading(trimmed) ? LOOKUP.get(norm(trimmed)) : undefined;
    if (!field || used.has(field)) continue;
    const body: Line[] = [];
    let j = i + 1;
    for (; j < all.length; j += 1) {
      const next = all[j].text.trim();
      if (next && ((looksLikeHeading(next) && (LOOKUP.has(norm(next)) || /^#{1,6}\s/.test(next) || /[:：]$/.test(next))) || inlineField(next))) break;
      body.push(all[j]);
    }
    const content = body.filter((l) => l.text.trim());
    if (content.length === 0) continue;
    used.add(field);
    const spans = content.map((l) => {
      const lead = l.text.length - l.text.trimStart().length;
      const t = l.text.trim();
      return { start: l.start + lead, end: l.start + lead + t.length, quote: t };
    });
    const items = content.map((l) => l.text.trim().replace(/^[-*•·]\s*|^\d+[.)]\s*/, ''));
    found.push({ field, heading: trimmed.replace(/^#+\s*/, '').replace(/[:：]$/, ''), value: LIST_FIELDS.has(field) ? items : items.join(' '), spans });
    i = j - 1;
  }
  return found;
}
