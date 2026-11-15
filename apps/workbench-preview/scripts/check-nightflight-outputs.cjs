// Run after building the preview. Requests are fulfilled in-process, without a project server or model.
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { chromium } = require('playwright');

const origin = 'https://nightflight.test';
const dist = resolve(__dirname, '../dist');
const file = (stage, name, kind, text) => ({
  stage,
  name,
  kind,
  text,
  url: '/api/projects/ui/files/' + encodeURIComponent(name),
});
const directions = ['春风', '明月', '初光'];
const preview = file('layout', '预览.deck.json', 'text');
const image = file('visual', 'visual-1-abc.png', 'image');
const project = {
  id: 'ui',
  title: '阶段排布验收',
  brief: '提交一份测试海报。',
  mode: 'collab',
  stage: 'final',
  status: 'done',
  revision: 1,
  events: [],
  feedback: [],
  attachments: [],
  directions,
  choice: directions[0],
  research: {
    ready: true,
    findings: [
      {
        conclusion: '测试发现',
        evidence: '可核对的原文',
        source: '测试材料',
        url: '',
        implication: '作为方向比较条件',
      },
    ],
    gaps: [],
    next: '',
  },
  artifacts: [
    file('brief', '任务卡.md', 'text', '## 已掌握的项目信息\n品类：测试品类\n提案目标：节日海报\n## 影响下一步的未知项\n渠道未定：先分别比较门店与社交媒体案例。\n## 原稿记录\n规范版本：测试版本'),
    file('research', '研究.md', 'text', '研究正文'),
    file(
      'strategy',
      '策略.md',
      'text',
      '## 研究结论\n不对应上游的旧稿结论。\n测试发现\n## 方向交叉点\n交叉内容。\n## 策略发力点\n提炼句。第二句展开。',
    ),
    file(
      'copy',
      '文案.md',
      'text',
      directions
        .map((s, i) => '## 方向' + (i + 1) + '：' + s + '\n主文案：' + s + '主题\n主张：' + s + '说明\n副文案：' + s + '副句\n气质：直白\n适用场景：门店\n视觉配合：主副文相邻\n值得选：品牌读得清\n误读风险：容易看成地名\n瓶侧示例：第一句\n瓶侧示例：另一种写法\n电商示例：独立场景')
        .join('\n'),
    ),
    image,
    preview,
    file('layout', '交付.pptx', 'pptx'),
    file('final', '终审.md', 'text', '## 文字核对\n待复核。'),
  ],
};
const stages = [
  ['项目任务卡'],
  ['关键发现'],
  ['核心策略'],
  ['三个创意方向'],
  ['视觉参考', '草图与主视觉', '样机'],
  ['提案预览'],
  ['本版提案', '终审记录', '你的反馈'],
];
async function main() {
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(macChrome) ? macChrome : undefined),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    const errors = [];
    const actions = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      if (req.method() === 'POST' && u.origin === origin && u.pathname === '/api/projects/ui/action') {
        actions.push(req.postDataJSON());
        return route.fulfill({ json: { project } });
      }
      if (u.origin !== origin || req.method() !== 'GET') return route.abort();
      const path = decodeURIComponent(u.pathname);
      if (path === '/api/projects') return route.fulfill({ json: { projects: [project] } });
      if (path === '/api/projects/ui') return route.fulfill({ json: { project } });
      if (u.pathname === preview.url)
        return route.fulfill({
          json: { title: '预览', pages: [{ id: 'p1', title: '封面', bg: '#ffffff', nodes: [] }] },
        });
      if (u.pathname === image.url)
        return route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
            'base64',
          ),
        });
      const asset = join(dist, path.endsWith('/') ? path + 'index.html' : path);
      return existsSync(asset) ? route.fulfill({ path: asset }) : route.abort();
    });
    await page.goto(origin + '/nightflight/#/p/ui');
    await page.locator('.stage-head').first().click();
    const stageFlags = ['brief', 'research', 'strategy', 'themes', 'visual', 'layout', 'delivery'];
    const selected = stageFlags.findIndex((flag) => process.argv.includes('--' + flag));
    for (const [i, headings] of stages.entries()) {
      if (selected >= 0 && i !== selected) continue;
      await page.locator('.sheet-tabs button').nth(i).click();
      const visible = await page.locator(i === 4 ? '.vg-section > h3' : '.sheet-doc h2:visible').allTextContents();
      assert.deepEqual(
        visible.map((s, n) => (s.startsWith(headings[n]) ? headings[n] : s)),
        headings,
      );
      if (i === 0) {
        const visible = await page.locator('.sheet-doc').innerText();
        assert.match(visible, /测试品类/);
        assert.match(visible, /先分别比较门店与社交媒体案例/);
        assert.doesNotMatch(visible, /规范版本|测试版本/);
      }
      if (i === 1) {
        const details = page.locator('.findings details');
        assert.equal(await details.evaluate((el) => el.open), false);
        assert.match(await details.locator('..').innerText(), /测试发现[\s\S]+作为方向比较条件/);
        await details.locator('summary').click();
        assert.match(await details.innerText(), /可核对的原文/);
      }
      if (i === 2) {
        assert.equal(await page.locator('.statement').innerText(), '提炼句。');
        const rows = page.locator('.strategy-findings li');
        assert.equal(await rows.first().locator('details').count(), 0);
        await rows.nth(1).locator('summary').click();
        assert.match(await rows.nth(1).innerText(), /可核对的原文/);
      }
      if (i === 3) {
        assert.doesNotMatch(await page.locator('.copy-compare').innerText(), /共同策略/);
        assert.equal(await page.locator('.dir-grid .dir').count(), 3);
        const theme = page.locator('.copy-theme');
        assert.deepEqual(await page.locator('.copy-browse').allTextContents(), directions.map(d => d + '主题'));
        await theme.locator('summary').click();
        assert.match(await theme.innerText(), /未登记单标题评审/);
        assert.doesNotMatch(await page.locator('.sheet-doc').textContent(), /副句|另一种写法|第一句|独立场景|品牌读得清|原始文件与下载/);
      }
      if (i === 5) await page.locator('.deck-stage').waitFor();
    }
    if (process.argv.includes('--visual')) {
      assert.equal(await page.locator('.vg-references img').count(), 0);
      assert.match(await page.locator('.vg-pair img').getAttribute('src'), /visual-1-abc/);
      await page.getByRole('button', {name:/方向 B.*明月/}).click();
      assert.equal(await page.locator('.vg-pair img, .vg-mockup img').count(), 0);
      assert.deepEqual(actions, []);
      await page.goto(origin + '/nightflight/#/reference/qingyu/visual?dir=v2');
      await page.locator('[data-visual-direction="v2"]').waitFor();
      assert.equal(await page.locator('.vg-reference-row').count(), 3);
      for (const id of ['v2', 'n7', 'k4']) {
        const row = page.locator('[data-reference-direction="' + id + '"]');
        assert.equal(await row.locator('.vg-references img').count(), 3);
        assert.ok((await row.locator('.vg-description').innerText()).trim());
        assert.deepEqual(await row.locator('.vg-references img').evaluateAll(images => images.map(img => getComputedStyle(img).objectFit)), ['cover', 'cover', 'cover']);
        await row.locator('.vg-direction').click();
        const pair = page.locator('[data-visual-direction="' + id + '"]');
        await pair.waitFor();
        assert.ok(page.url().endsWith('dir=' + id));
        await pair.getByRole('group').getByRole('button').nth(2).click();
        assert.match(await pair.locator('.vg-zoom img').first().getAttribute('src'), new RegExp(id + '-sketch-3'));
        assert.match(await pair.locator('.vg-zoom img').last().getAttribute('src'), new RegExp(id + '-main'));
        assert.match(await page.locator('.vg-mockup img').getAttribute('src'), new RegExp(id + '-mockups'));
        assert.equal(await page.locator('.vg-details').evaluate(el => el.open), false);
        await page.locator('.visual-image-gallery img').evaluateAll(async imgs => {
          await Promise.all(imgs.map(img => img.decode()));
        });
        const zoom = page.locator('.vg-mockup .vg-zoom');
        await zoom.click();
        await page.getByRole('dialog').getByRole('button', { name:'关闭' }).click();
        assert.equal(await zoom.evaluate(el => el === document.activeElement), true);
      }
    }
    if (process.argv.includes('--themes')) {
      project.stage = 'copy';
      project.status = 'waiting';
      project.choice = undefined;
      await page.reload();
      await page.locator('.stage-head').nth(3).click({ force: true });
      const doc = page.locator('.sheet-doc');
      await doc.getByRole('button', { name: '明月主题', exact: true }).click();
      assert.equal(await doc.getByRole('button', {name:'明月主题'}).getAttribute('aria-pressed'), 'true');
      assert.deepEqual(actions, []);
      await Promise.all([page.waitForResponse((res) => res.url().endsWith('/action')),
        doc.getByRole('button', { name: '采用此方向' }).click()]);
      assert.deepEqual(actions.map(({ kind, text }) => [kind, text]), [['choice', '明月']]);
      const draft = { directions: directions.map((name, i) => ({
        id: 'ABC'[i], name, main: name + '独立标题', duty: ['continuity', 'feature', 'emotion'][i],
      })) };
      const votes = ['copy', 'brand', 'user', 'comms'].map(role => ({
        role, draftHash: 'ui-only', runId: 'ui-' + role, items: draft.directions.map(d => ({
          directionId:d.id, decision:'pass', reason:'隔离夹具的评审理由', blockers:[], hardRejects:[],
          scores:[{dimension:'测试维度',score:4,reason:'按标题核对',evidence:d.main}],
        })),
      }));
      project.copyReview = {
        version:2,protocol:'dual-panel-headline-v3',status:'ready',draft,initialDraft:draft,firstVotes:votes,
        finalVotes:votes.map(v=>({...v,reused:true})),changes:[],challenges:[],
        adjudication:{ready:true,reason:'测试裁定',rulings:[]},
        recommendation:{directionId:'C',reason:'推荐核对项',tradeoff:'取舍核对项'},
      };
      await page.reload();
      await page.locator('.stage-head').nth(3).click({force:true});
      assert.deepEqual(await doc.locator('.copy-browse').allTextContents(),draft.directions.map(d=>d.main));
      assert.doesNotMatch(await doc.innerText(), /推荐核对项/);
      await doc.getByText('本标题的评审与推荐',{exact:true}).click();
      assert.match(await doc.innerText(), /推荐核对项/);
      const review = doc.locator('[data-copy-review="C"]');
      await review.locator(':scope > details > summary').click();
      const role = review.locator('[data-review-role="copy"]');
      await role.locator('summary').click();
      assert.match(await role.innerText(), /按标题核对/);
      assert.match(await review.innerText(), /历史单标题评审/);
      assert.equal(await review.locator('[data-check-group]').count(), 0);

      const common = ['事实准确，归属清楚', '单句读得懂，念得顺', '能接上本案策略'];
      const tasks = ['用户氛围或情绪放大', '稳健延续', '品牌或产品特征放大'];
      const newDraft = { directions: draft.directions.map((d, i) => ({
        ...d, duty: ['emotion','continuity','feature'][i],
      })) };
      const checks = (d, i) => [...common, tasks[i]].map(criterion => ({
        criterion, passed: true, evidence: d.main, reason: criterion + '的裁定理由',
      }));
      const observations = votes.map((v, roleIndex) => ({
        ...v, items: v.items.map((item, i) => ({
          ...item, decision: 'hold', scores: checks(newDraft.directions[i], i).slice(roleIndex, roleIndex === 3 ? roleIndex : roleIndex+1).map(c => ({
            dimension: c.criterion, score: 2, evidence: c.evidence, reason: '测试观察意见',
          })),
        })),
      }));
      project.copyReview = {
        ...project.copyReview, version: 3, protocol:'dual-panel-headline-v4',
        draft:newDraft, initialDraft:newDraft, firstVotes:observations,
        finalVotes:observations.map(v=>({...v,reused:true})),
        challenges:[{role:'comms',items:[],coverage:newDraft.directions.map(d=>({
          directionId:d.id,dimension:common[0],originalObserved:false,originalClaim:'原岗总体意见',originalEvidence:null,reason:'核原票没有这一项',
        }))}],
        adjudication:{ready:true,reason:'本组裁定',rulings:[], set:{ready:true,reason:'整组核对'},
          pairs:['AB','AC','BC'].map(pair=>({pair,distinct:true,reason:pair+'独立差异'})),
          single:newDraft.directions.map((d,i)=>({directionId:d.id,ready:true,reason:'当前标题可交接',checks:checks(d,i).reverse()}))},
        recommendation:{directionId:'C',reason:'推荐原因',tradeoff:'保留取舍', memory:'记住品牌名',retell:'自然说出这句',scene:'面对货架时'},
      };
      await page.reload();
      await page.locator('.stage-head').nth(3).click({force:true});
      assert.deepEqual(await doc.locator('.copy-browse').allTextContents(),newDraft.directions.map(d=>d.main));
      assert.doesNotMatch(await doc.innerText(), /本案策略|面对货架时/);
      assert.deepEqual(await page.locator('.chat .option-text strong').allTextContents(),newDraft.directions.map(d=>d.main));
      for (const [i,d] of newDraft.directions.entries()) {
        await doc.getByRole('button',{name:d.main,exact:true}).click();
        await doc.getByText('本标题的评审与推荐',{exact:true}).click();
        const current = doc.locator('[data-copy-review="'+d.id+'"]');
        assert.deepEqual(await current.locator('[data-check-group="三个共通要求"] dt').allTextContents(), common);
        assert.deepEqual(await current.locator('[data-check-group="本方向任务"] dt').allTextContents(), [tasks[i]]);
        assert.match(await current.locator('[data-check-group="本方向任务"]').innerText(), /通过/);
        assert.ok((await current.innerText()).includes(tasks[i]+'的裁定理由'));
        for(const pair of ['AB','AC','BC']) assert.ok((await current.innerText()).includes(pair+'独立差异'));
        for(const basis of ['记住品牌名','自然说出这句','面对货架时']) assert.ok((await current.locator('[data-recommendation-basis]').innerText()).includes(basis));
        await current.locator(':scope > details > summary').click();
        const original=current.locator('[data-review-role="copy"]');
        await original.locator('summary').click();
        assert.equal(await original.locator('[data-dimension]').count(),1);
        assert.match(await original.innerText(), /2 分/);
        assert.match(await original.innerText(), /原稿评分 · 待核/);
        const sparse=current.locator('[data-review-role="comms"]');
        await sparse.locator('summary').click();
        assert.equal(await sparse.locator('[data-dimension]').count(),0);
        assert.match(await sparse.innerText(), /原票未观察此项/);
        assert.doesNotMatch(await sparse.innerText(), /原据/);
        assert.doesNotMatch(await doc.textContent(), /副句|第一句|独立场景/);
      }
      project.copyReview = {...project.copyReview,version:1,protocol:'dual-panel-v2'};
      await page.reload();
      await page.locator('.stage-head').nth(3).click({force:true});
      await doc.getByText('评审记录',{exact:true}).click();
      assert.match(await doc.innerText(), /旧版按主副文合读评审/);
      assert.equal(await doc.locator('[data-check-group]').count(),0);
      assert.doesNotMatch(await doc.textContent(), /副句|第一句|独立场景/);

    }
    if (process.argv.includes('--themes')) {
      const archive = require('../src/proposal/qingyu-themes/reviewed-copy.json');
      const round = archive.rounds.find((r) => r.id === archive.currentRoundId);
      await page.goto(origin + '/nightflight/#/reference/qingyu/copy?edition=archive');
      for (const d of round.draft.directions) {
        await page.getByRole('button', {name:d.slogan, exact:true}).click();
        const panel = page.locator('.copy-theme');
        await panel.locator('summary').click();
        assert.match(await panel.innerText(), /旧版按主副文合读评审/);
        const text = await page.locator('.sheet-doc').textContent();
        assert.ok(!text.includes(d.subline));
        for (const point of d.extensions) assert.ok(!text.includes(point.text));
      }
    }
    if (process.argv.includes('--research')) {
      project.stage = 'research';
      project.status = 'waiting';
      Object.assign(project.research, {
        ready: false,
        gaps: ['问题：优先门店还是线上？原因：决定比较哪组传播素材。', '已有线索：两组素材清单'],
        question: '先查哪个渠道？',
      });
      await page.goto(origin + '/nightflight/#/p/ui?stage=research');
      await page.reload();
      const doc = page.locator('.sheet-doc');
      await doc.getByRole('heading', { name: '影响策略的待查问题' }).waitFor();
      assert.match(await doc.innerText(), /优先门店还是线上[\s\S]+决定比较哪组传播素材/);
      assert.doesNotMatch(await doc.innerText(), /两组素材清单|测试发现/);
      await doc.locator('summary', { hasText: '已有线索' }).click();
      assert.match(await doc.innerText(), /两组素材清单/);
      assert.match(await doc.innerText(), /测试发现/);
      assert.equal(await doc.getByLabel('先查哪个渠道？').count(), 1);
    }
    assert.deepEqual(errors, []);
    console.log(selected >= 0 ? stages[selected][0] + '页面专项通过。' : '七阶段栏目与交互检查通过。');
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
