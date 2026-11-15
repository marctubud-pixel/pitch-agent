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
  ['三个创意方向', '主题文案'],
  ['草图与主视觉'],
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
      const visible = await page.locator('.sheet-doc h2:visible').allTextContents();
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
        assert.equal(await page.locator('.dir-grid .dir').count(), 3);
        const theme = page.locator('.copy-theme');
        const visible = await theme.innerText();
        for (const phrase of ['品牌读得清', '容易看成地名', '第一句', '独立场景']) {
          assert.ok(visible.includes(phrase), phrase);
        }
        assert.doesNotMatch(visible, /另一种写法/);
        await theme.locator('summary').click();
        assert.match(await theme.innerText(), /另一种写法/);
      }
      if (i === 5) await page.locator('.deck-stage').waitFor();
    }
    if (process.argv.includes('--themes')) {
      project.stage = 'copy';
      project.status = 'waiting';
      project.choice = undefined;
      await page.reload();
      await page.locator('.stage-head').nth(3).click({ force: true });
      const doc = page.locator('.sheet-doc');
      await doc.getByRole('button', { name: '明月', exact: true }).click();
      assert.equal(await doc.locator('.copy-theme h2').innerText(), '主题文案 · 明月');
      assert.deepEqual(actions, []);
      await Promise.all([page.waitForResponse((res) => res.url().endsWith('/action')),
        doc.getByRole('button', { name: '采用「明月」' }).click()]);
      assert.deepEqual(actions.map(({ kind, text }) => [kind, text]), [['choice', '明月']]);
    }
    if (process.argv.includes('--themes')) {
      const archive = require('../src/proposal/qingyu-themes/reviewed-copy.json');
      const round = archive.rounds.find((r) => r.id === archive.currentRoundId);
      await page.goto(origin + '/nightflight/#/reference/qingyu/copy');
      for (const d of round.draft.directions) {
        await page.getByRole('button', { name: d.name, exact: true }).click();
        const review = page.locator('[data-copy-review="' + d.id + '"]');
        assert.equal(await page.locator('.copy-theme .statement').innerText(), d.slogan);
        assert.equal(await page.locator('.copy-theme .lead').innerText(), d.subline);
        await review.locator(':scope > details > summary').click();
        for (const original of round.reviews) {
          const role = review.locator('[data-review-role="' + original.role + '"]');
          await role.locator(':scope > summary').click();
          const scores = original.raw.items.find((item) => item.id === d.id).scores;
          assert.equal(await role.locator('[data-dimension]').count(), scores.length);
          for (const score of scores) {
            const cell = role.locator('[data-dimension="' + score.dimension_id + '"]');
            const text = await cell.innerText();
            assert.ok(text.includes(score.dimension));
            assert.ok(text.includes('原分 ' + score.score + ' 分'));
            const evidence = typeof score.evidence === 'string' ? score.evidence : score.evidence.reason;
            if (evidence) assert.ok(text.includes(evidence));
          }
          if (d.id === 'k4' && original.role === 'user') {
            const follow = role.locator('[data-review-followup="benefit_emotion"]');
            assert.match(await follow.innerText(), /原分 3 分.*复核 4 分/);
          } else {
            assert.equal(await role.locator('[data-review-followup]').count(), 0);
          }
        }
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
