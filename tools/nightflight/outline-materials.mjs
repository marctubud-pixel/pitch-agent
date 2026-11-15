import { basename, dirname, join } from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { rowOf, sectionsOf } from '../../apps/workbench-preview/nightflight/src/components/stageText.ts';

export const materialSheetName = '逐页材料.md';

// Service copies immutable, project-owned files into this attempt. Never follow a manifest path.
export async function readAttemptText(root, name) {
  if (!name || basename(name) !== name) throw Error('逐页编稿的材料名无效');
  const file = await realpath(join(root, name));
  if (dirname(file) !== root) throw Error('逐页编稿材料超出本次任务目录');
  return readFile(file, 'utf8');
}

const identities = {
  brand: ['品牌原图'], competitors: ['同类原图'], audience: ['实景照片', 'AI场景示意'],
  'kv-process': ['制作过程记录'], 'kv-motion': ['动效关键帧', '分镜设想'],
  'kv-adaptation': ['第二画幅成稿'], 'kv-primary-use': ['媒介样机'], 'kv-second-use': ['媒介样机'],
  'pack-views': ['同版包装视图'], 'pack-detail': ['同版包装细节'], 'pack-series': ['同版系列图'],
  'pack-shelf': ['售卖现场实拍', '售卖场景模拟'], 'pack-second-use': ['购买触点样机'],
  activation: ['活动设想'],
};

export async function readPageMaterials(root, project, slots, mains) {
  const attachments = project.attachments ?? [];
  const bound = new Map();
  const issues = [];
  if (!attachments.some(a => a.name === materialSheetName)) return { bound, issues };
  const pictures = new Set(attachments.filter(a => /\.(?:png|jpe?g)$/iu.test(a.name)).map(a => a.name));
  const slotsById = new Map(slots.map(page => [page.instance_id, page]));
  const seen = new Set();
  const markdown = await readAttemptText(root, materialSheetName);
  for (const { heading, lines } of sectionsOf(markdown)) {
    if (!heading.includes('/')) continue;
    const page = slotsById.get(heading);
    const labels = identities[page?.type_id];
    if (!labels) {
      issues.push('逐页材料中的页位未启用或不接收附件：' + heading);
      continue;
    }
    if (seen.has(heading)) {
      bound.delete(heading);
      issues.push('逐页材料对同一页给出了重复记录：' + heading);
      continue;
    }
    seen.add(heading);
    const rows = lines.map(rowOf).filter(Boolean);
    const values = label => rows.filter(row => row.label === label).map(row => row.value);
    const one = label => values(label).length === 1 ? values(label)[0] : '';
    const identity = one('身份'), source = one('来源'), caption = one('说明');
    const images = [...new Set(values('图片'))];
    if (!labels.includes(identity) || !source || !caption || !images.length ||
        !images.every(name => pictures.has(name))) {
      issues.push(heading + ' 的身份、来源、说明或本项目原图未能核对。');
      continue;
    }
    const direction = page.type_id === 'activation' ? one('承接方向') : page.direction;
    if ((page.direction || page.type_id === 'activation') &&
        (!direction || !mains.get(direction) || mains.get(direction).name !== one('对应主稿'))) {
      issues.push(heading + ' 未能对应本方向本次采用的主稿。');
      continue;
    }
    bound.set(heading, { identity, caption, source, images, direction });
  }
  return { bound, issues };
}
