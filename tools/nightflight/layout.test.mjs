import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { runLayout } from './layout.mjs';

const req = createRequire(new URL('../../apps/workbench-preview/package.json', import.meta.url));
const { unzipSync, strFromU8 } = req('fflate');

test('exports the fixture body as editable native text, keeps original PNG bytes, and paginates long copy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nightflight-layout-'));
  try {
    const title = '很长的用户提案需求'.repeat(8);
    const text = '原创研究记录。'.repeat(90) + '尾端标记';
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    await writeFile(join(dir, 'research.md'), text);
    await writeFile(join(dir, 'kv.png'), png);
    const { artifacts, pages, layoutChanges } = await runLayout({ dir, project: {
      feedback:[{stage:'layout',text:'第 1 页，把『独立简报』改为『新简报』'}],
      title, brief: '独立简报', directions: ['原野', '飞鸟', '星空'], choice: '星空',
      artifacts: [{ stage: 'research', kind: 'text', name: 'research.md' }, { stage: 'visual', kind: 'image', name: 'kv.png' }],
    } });
    const preview = artifacts.find(item => item.name.endsWith('.deck.json'));
    assert.equal(preview.kind, 'text');
    assert.equal(preview.text, undefined);
    const deck = JSON.parse(await readFile(join(dir, preview.name), 'utf8'));
    assert.equal(deck.title, title);
    assert.equal(deck.pages.length, pages);
    const media = deck.pages.flatMap(page => page.nodes).find(node => node.kind === 'image');
    assert.deepEqual(Buffer.from(media.image.data.split(',')[1], 'base64'), png);
    const files = unzipSync(await readFile(join(dir, artifacts[0].name)));
    const slides = Object.keys(files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => Number(a.match(/(\d+)\.xml/)[1]) - Number(b.match(/(\d+)\.xml/)[1]));
    assert.equal(slides.length, pages);
    assert.ok(pages > 3);
    const words = slides.map(k => [...strFromU8(files[k]).matchAll(/<a:t>([^<]*)<\/a:t>/gu)].map(m => m[1]).join('')).join('');
    assert.ok(words.includes('新简报'));
    assert.equal(layoutChanges[0].from,'独立简报');
    assert.ok(words.includes('尾端标记'));
    assert.ok(words.includes('采用方向：星空'));
    assert.ok(Object.entries(files).some(([k, bytes]) => k.startsWith('ppt/media/') && Buffer.from(bytes).equals(png)));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

for (const [kind, mode] of [['packaging', 'auto'], ['kv', 'collab']]) {
  test(kind + ' exports the ordered outline and the same visible pages as editable PowerPoint', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nightflight-outline-'));
    try {
      const directions = mode === 'collab' ? ['溪水', '晨雾与第一杯茶'.repeat(26)] : ['溪水', '晨雾'];
      const title = '很长的用户提案需求'.repeat(8);
      const finding = '同类产品用多种表达传达泡茶的方式。'.repeat(10) + '最终研究条件';
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
      const artifacts = [];
      for (const [i, direction] of directions.entries()) {
        const name = '主视觉-' + i + '.png';
        await writeFile(join(dir, name), png);
        artifacts.push({ name, stage: 'visual', kind: 'image', adoptedForLayout:mode==='collab', visual: {
          role: 'main', direction, candidate: 2, recommended: mode!=='collab', reason: '主形清楚人能辨认。',
        } });
      }
      const rejected = { name: '未选图.png', stage: 'visual', kind: 'image',
        visual: { role: 'main', direction: directions[0], candidate: 1, recommended: false } };
      const primary = kind==='packaging' ? '#963D20' : '#174D69';
      const accent = kind==='packaging' ? '#DEC59C' : '#E1BC42';
      const identity = ['品牌主色：'+primary,'辅助色：'+accent,'提案方：测试设计组','品牌 Logo：品牌标志.png','标题字体：Arial'].join('\n');
      const brief = '在两个渠道展示产品。'.repeat(90) + '简报末尾的限制条件' + (kind==='kv' ? '\n'+identity : '');
      const attachments=[{kind:'attachment',name:'品牌标志.png'}];
      await writeFile(join(dir,'品牌标志.png'),png);
      if (kind==='packaging') {
        attachments.push({kind:'attachment',name:'品牌规范.md'});
        await writeFile(join(dir,'品牌规范.md'),identity);
      }
      const result = await runLayout({ dir, project: {
        title, brief, proposalKind: kind, mode, directions, choice: directions[1],
        artifacts: [...artifacts, rejected], attachments, research: {
          findings: [{ chapter: '行业与市场', conclusion: finding, evidence: '两年均按5至8月的渠道销量统计。2024年10万件，2025年12万件。',
            source: '测试原件', implication: '要让人先认出品牌。' },
            {chapter:'行业与市场',conclusion:'另一渠道口径',source:'另一份原件',
              evidence:'仅统计8至9月的渠道销量。',implication:'只在该渠道采用。'},
            ...['品牌甲','品牌乙'].map((source,i)=>({chapter:'竞争与同类传播',source,conclusion:i?'品类词居中':'品牌名突出',evidence:'在售产品观察',implication:'对照信息层次'})),
            {chapter:'人群与接触情境',source:'观察底稿',conclusion:'通勤人群在路上挑饮品',evidence:'记录了通勤场景。',implication:'缩短识别时间。'}], gaps: [],
        },
      } });
      const name = suffix => result.artifacts.find(a => a.name.endsWith(suffix)).name;
      const deck = JSON.parse(await readFile(join(dir, name('.deck.json')), 'utf8'));
      const plan = JSON.parse(await readFile(join(dir, name('.outline.json')), 'utf8'));
      assert.equal(plan.kind, kind);
      assert.equal(plan.physical_page_count, deck.pages.length);
      assert.equal(result.pages, plan.physical_page_count);
      assert.equal(deck.pages[0].template, 'cover.type');
      assert.equal(deck.pages[1].template, 'contents.list');
      assert.equal(deck.pages.at(-1).template, 'closing.type');
      const visible = mode === 'collab' ? [directions[1]] : directions;
      const heroes = plan.pages.filter(p => p.type_id === (kind === 'kv' ? 'kv-hero' : 'pack-front'));
      assert.deepEqual(heroes.map(p => p.direction), visible);
      assert.deepEqual(heroes.map(p => p.images[0]), visible.map(n => '主视觉-' + directions.indexOf(n) + '.png'));
      assert.ok(plan.gaps.some(g => g.type_id === (kind === 'kv' ? 'kv-primary-use' : 'pack-shelf')));
      assert.ok(deck.status.includes('待补'));
      let next = 1;
      for (const p of plan.pages) {
        assert.equal(p.first_page, next);
        assert.ok(p.last_page >= p.first_page);
        assert.equal(deck.pages[p.first_page - 1].title, p.client_title);
        next = p.last_page + 1;
      }
      for (const [type,kind] of [['assignment','section.left'],['category','market.bars'],['competitors','competitor.table'],['audience','persona.single']]) {
        const slot=plan.pages.find(p=>p.type_id===type);
        assert.equal(deck.pages[slot.first_page-1].template,kind,type+' '+JSON.stringify(slot));
        assert.equal(slot.applied_templates[0],kind);
      }
      const titleSlide = plan.pages.find(p => p.type_id === 'assignment');
      assert.ok(titleSlide.last_page > titleSlide.first_page);
      const files = unzipSync(await readFile(join(dir, name('.pptx'))));
      const nativeTheme=strFromU8(files['ppt/theme/theme1.xml']);
      assert.ok(nativeTheme.includes('<a:accent1><a:srgbClr val="'+primary.slice(1)+'"'));
      assert.ok(nativeTheme.includes('<a:accent2><a:srgbClr val="'+accent.slice(1)+'"'));
      assert.equal(deck.style,kind==='packaging'?'elegant':'bold');
      assert.ok(deck.pages[0].nodes.some(n=>n.kind==='image' && n.image.alt==='品牌标志.png'));
      assert.ok(strFromU8(files['ppt/slides/slide1.xml']).includes('测试设计组'));
      const slides = Object.keys(files).filter(k => /^ppt\/slides\/slide\d+\.xml$/u.test(k));
      assert.equal(slides.length, deck.pages.length);
      const renders = result.artifacts.filter(a=>a.kind==='image' && /^page-\d+-/.test(a.name));
      assert.equal(renders.length, slides.length);
      assert.deepEqual(renders.map(a=>a.renderPage), slides.map((_,i)=>i+1));
      assert.ok((await readFile(join(dir, renders[0].name))).subarray(0,2).equals(Buffer.from([255,216])));
      const slideWords = n => [...strFromU8(files['ppt/slides/slide' + n + '.xml']).matchAll(/<a:t>([^<]*)<\/a:t>/gu)].map(m => m[1]).join('');
      const words = deck.pages.map((p, i) => slideWords(i + 1)).join('');
      const firstWords=type=>slideWords(plan.pages.find(p=>p.type_id===type).first_page);
      assert.ok(firstWords('category').includes('5至8月') && firstWords('category').includes('要让人先认出品牌'));
      assert.ok(firstWords('audience').includes('记录了通勤场景') && firstWords('audience').includes('缩短识别时间'));
      const continuationWords=type=>{
        const slot=plan.pages.find(p=>p.type_id===type);
        return Array.from({length:slot.last_page-slot.first_page},(_,i)=>slideWords(slot.first_page+i+1)).join('');
      };
      const marketExtra=continuationWords('category'), personExtra=continuationWords('audience');
      assert.ok(!marketExtra.includes('5至8月') && !marketExtra.includes('要让人先认出品牌'));
      assert.ok(marketExtra.includes('8至9月') && marketExtra.includes('只在该渠道采用'));
      assert.ok(!personExtra.includes('记录了通勤场景') && !personExtra.includes('缩短识别时间'));
      assert.ok(personExtra.includes('对应场景图待补'));
      assert.ok(!firstWords('audience').includes('需求') && !firstWords('audience').includes('痛点'));
      assert.ok(words.includes('简报末尾的限制条件'));
      assert.ok(words.includes('最终研究条件'));
      assert.ok(deck.pages[0].notes.includes(title));
      assert.ok(heroes.every(h => deck.pages[h.first_page - 1].notes.includes(h.direction)));
      assert.ok(!words.includes('本页要填什么') && !words.includes('未选图'));
      const toc = plan.pages.find(p => p.type_id === 'toc');
      const tocWords = deck.pages.slice(toc.first_page - 1, toc.last_page).map((p, i) => slideWords(toc.first_page + i)).join('');
      for (const { chapter, display_title, start_page } of plan.contents) {
        assert.equal(deck.pages.findIndex(p => p.chapter === chapter) + 1, start_page);
        assert.ok(tocWords.includes(display_title) && tocWords.includes('P' + String(start_page).padStart(2, '0')));
      }
      assert.ok(Object.entries(files).some(([path, data]) => path.startsWith('ppt/media/') && Buffer.from(data).equals(png)));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('qualitative research keeps its evidence and records why the market chart is unavailable',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'nightflight-semantic-fallback-'));
  try {
    const {artifacts}=await runLayout({dir,project:{title:'纸盒提案',proposalKind:'packaging',brief:'比较同类纸盒',
      mode:'auto',directions:['延续','突出产品'],attachments:[],artifacts:[],research:{findings:[{
        chapter:'行业与市场',conclusion:'样本的标签分两类',source:'观察记录',evidence:'样本甲用侧标，样本乙用正标。',implication:'比较陈列效果。'
      }]}}});
    const get=async suffix=>JSON.parse(await readFile(join(dir,artifacts.find(a=>a.name.endsWith(suffix)).name),'utf8'));
    const [plan,deck]=await Promise.all([get('.outline.json'),get('.deck.json')]);
    const row=plan.pages.find(p=>p.type_id==='category');
    assert.deepEqual(row.template,{type:'market',variant:'bars'});
    assert.match(row.fallback_reason,/数值/);
    assert.deepEqual(row.applied_templates,['summary.statement']);
    const txt=deck.pages[row.first_page-1].nodes.filter(n=>n.kind==='text').map(n=>n.lines.join('')).join('');
    assert.ok(txt.includes('样本甲用侧标，样本乙用正标'));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('unrelated competitor files cannot supply a brand identity and the original Brief resolves conflicting guides',async()=>{
  const {projectTheme}=await import('./layout-theme.mjs');
  const dir=await mkdtemp(join(tmpdir(),'nightflight-brand-input-'));
  try {
    const docs=[['竞品品牌规范.md','提案方：其他客户\n品牌主色：#123456'],['品牌规范1.md','主色：#110000\n品牌字体：Arial'],['品牌规范2.md','主色：#220000\n品牌字体：Arial']];
    await Promise.all(docs.map(([name,text])=>writeFile(join(dir,name),text)));
    const project={brief:'',attachments:docs.map(([name])=>({kind:'attachment',name}))};
    const fallback=await projectTheme(project,dir,'packaging');
    assert.equal(fallback.primary,'#143F9B');
    assert.equal(fallback.fonts.body,'Arial');
    assert.equal(fallback.agencyName,undefined);
    const briefing=await projectTheme({...project,brief:'主色：#448899\n版式风格：杂志编辑'},dir,'kv');
    assert.equal(briefing.primary,'#448899');assert.equal(briefing.style,'editorial');
  } finally { await rm(dir,{recursive:true,force:true}); }
});
