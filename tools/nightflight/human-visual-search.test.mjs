import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  detectVisualTrack,
  humanBrowseVisualReferences,
  rankHuabanPins,
  sanitizeTrackQuery,
  searchDuitang,
  searchGooood,
  searchHuaban,
  searchLocalReferenceLibrary,
  searchXApiImages,
  searchYellowtrace,
} from './human-visual-search.mjs';

const sampleJpg = Buffer.alloc(16000, 0xff);

test('detectVisualTrack routes packaging, poster, event and excludes TVC', () => {
  assert.equal(detectVisualTrack('清酌330ml透明细长瓶包装设计', ['packaging']), 'packaging');
  assert.equal(detectVisualTrack('清酌主视觉海报设计', ['kv']), 'poster');
  assert.equal(detectVisualTrack('都市年轻人透明小酒馆快闪空间活动', ['event']), 'event');
  assert.equal(detectVisualTrack('品牌TVC广告片分镜脚本', ['tvc']), null);
  assert.equal(detectVisualTrack('品牌TVC广告片脚本', []), null);
  assert.equal(detectVisualTrack('线下快闪店装置体验', []), 'event');
  assert.equal(detectVisualTrack('极简透明玻璃瓶身礼盒', []), 'packaging');
});

test('sanitizeTrackQuery enforces language and short-token bounds per adapter', () => {
  assert.equal(sanitizeTrackQuery('bpando', '极简 clear glass bottle minimal label photo'), 'clear glass bottle');
  assert.equal(sanitizeTrackQuery('designboom', '透明玻璃 glass pavilion installation pop-up'), 'glass pavilion installation');
  assert.equal(sanitizeTrackQuery('digitaling', '微醺 海报 极简 留白 餐桌'), '微醺 海报');
  assert.equal(sanitizeTrackQuery('digitaling', '极简饮品棚拍海报清爽微醺'), '极简饮品棚拍');
  assert.equal(sanitizeTrackQuery('bpando', '纯中文没有英文'), '');
});

test('searchLocalReferenceLibrary prioritizes track subfolder and manifest tags', async t => {
  const lib = await mkdtemp(join(tmpdir(), 'nightflight-local-lib-'));
  t.after(() => rm(lib, {recursive: true, force: true}));
  await mkdir(join(lib, 'packaging'), {recursive: true});
  await mkdir(join(lib, 'shared'), {recursive: true});
  await writeFile(join(lib, 'packaging', 'clear-bottle.jpg'), sampleJpg);
  await writeFile(join(lib, 'shared', 'generic-mood.jpg'), sampleJpg);
  await writeFile(join(lib, 'manifest.json'), JSON.stringify({
    'packaging/clear-bottle.jpg': {title: '透明清酒瓶实拍', tags: ['透明', '极简', '玻璃瓶']},
  }));
  const hits = await searchLocalReferenceLibrary({libraryDir: lib, track: 'packaging', keywords: ['透明 极简']});
  assert.equal(hits.length, 2);
  assert.equal(hits[0].title, '透明清酒瓶实拍');
  assert.equal(hits[0].source, '本地精选库');
  assert.match(hits[0].pageUrl, /^local:\/\/reference-library\/packaging\/clear-bottle\.jpg$/);
});

test('searchXApiImages skips gracefully without token and parses photo media with token', async () => {
  assert.deepEqual(await searchXApiImages('minimal bottle', {token: ''}), []);
  const hits = await searchXApiImages('minimal bottle', {
    token: 'test-token',
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        includes: {
          media: [
            {type: 'video', url: 'https://pbs.twimg.com/media/skip.mp4'},
            {type: 'photo', url: 'https://pbs.twimg.com/media/good1.jpg'},
          ],
        },
      }),
    }),
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].source, 'X(Twitter)');
  assert.equal(hits[0].coverUrl, 'https://pbs.twimg.com/media/good1.jpg');
});

test('humanBrowseVisualReferences runs 4-step browse loop with Round 2 and returns borrow3/avoid2 + socialKeywords', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'nightflight-human-browse-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const calls = [];
  const fakeCall = async (_prompt, images, schema, meta) => {
    calls.push({assignment: meta.assignment, imageCount: images.length});
    if (schema.properties.xhsKeywords) {
      return {
        parsedOutput: {
          thinking: '跨品类找透明快闪空间',
          queries: [{adapter: 'digitaling', query: '快闪 空间', why: '真实快闪实拍'}],
          xhsKeywords: ['透明 快闪 空间', '快闪酒吧 打卡'],
          xKeywords: ['glass pop-up bar', 'minimalist pavilion'],
        },
      };
    }
    if (schema.properties.openIndices) {
      const isR1 = meta.assignment.includes('第1轮');
      return {
        parsedOutput: {
          eyeImpression: '视觉骨架高级',
          openIndices: [1],
          rejectReasons: '无',
          needRound2: isR1,
          round2Reason: isR1 ? '补搜玻璃展亭' : '',
          round2Queries: isR1 ? [{adapter: 'designboom', query: 'glass pavilion', why: '补透明空间'}] : [],
        },
      };
    }
    return {
      parsedOutput: {
        fallbackToArtDirection: false,
        top1Index: 1,
        top2Index: 2,
        whyTop1: '图#1建筑门头与大玻璃橱窗尺度高级',
        toneMatchNote: '借建筑立面和通透橱窗',
        borrow3: ['对称快闪门头', '大玻璃橱窗通透感', '室内吧台纵深'],
        avoid2: ['原品牌招牌字', '原粉红墙色'],
        disqualifiedNotes: '无',
      },
    };
  };

  let downloadCounter = 0;
  const results = await humanBrowseVisualReferences({
    call: fakeCall,
    brief: '清酌透明小酒馆快闪体验活动',
    direction: '透明快闪',
    carriers: ['event'],
    dir,
    deps: {
      searchLocal: async () => [],
      searchAdapter: async (adapter, query) => [{
        source: adapter === 'digitaling' ? '数英网' : 'Designboom',
        title: `${adapter}-${query}`,
        projectUrl: `https://example.org/${adapter}/${encodeURIComponent(query)}`,
        coverUrl: `https://example.org/${adapter}/cover.jpg`,
        detailImageUrls: [`https://example.org/${adapter}/detail1.jpg`],
      }],
      download: async (url, destBase) => {
        downloadCounter++;
        const filePath = `${destBase}.jpg`;
        const buf = Buffer.from(`fake-jpg-${downloadCounter}-${url}`);
        await writeFile(filePath, buf);
        return {
          path: filePath,
          mediaType: 'image/jpeg',
          sha256: `${downloadCounter}`.padStart(64, '0'),
          byteLength: buf.length,
          width: 1200,
          height: 800,
          sourceUrl: url,
        };
      },
      makeContactSheet: async (_items, outPath) => {
        await writeFile(outPath, Buffer.from('grid'));
        return {ok: true, outPath};
      },
    },
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].track, 'event');
  assert.deepEqual(results[0].borrow3, ['对称快闪门头', '大玻璃橱窗通透感', '室内吧台纵深']);
  assert.deepEqual(results[0].socialKeywords.xhs, ['透明 快闪 空间', '快闪酒吧 打卡']);
  assert.ok(calls.some(c => c.assignment.includes('第2轮')));
});

test('humanBrowseVisualReferences gracefully returns empty array on fallbackToArtDirection', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'nightflight-human-fallback-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const fakeCall = async (_p, _i, schema) => {
    if (schema.properties.xhsKeywords) {
      return {parsedOutput: {thinking: 'ok', queries: [{adapter: 'bpando', query: 'clear bottle', why: 'ok'}], xhsKeywords: [], xKeywords: []}};
    }
    if (schema.properties.openIndices) {
      return {parsedOutput: {eyeImpression: 'ok', openIndices: [1], rejectReasons: '', needRound2: false, round2Reason: '', round2Queries: []}};
    }
    return {
      parsedOutput: {
        fallbackToArtDirection: true,
        top1Index: 0,
        top2Index: 0,
        whyTop1: '',
        toneMatchNote: '',
        borrow3: [],
        avoid2: [],
        disqualifiedNotes: '均为拼图或示意图',
      },
    };
  };
  const results = await humanBrowseVisualReferences({
    call: fakeCall,
    brief: '极简透明瓶包装',
    carriers: ['packaging'],
    dir,
    deps: {
      searchLocal: async () => [],
      searchAdapter: async () => [{source: 'BP&O', title: 'Test', projectUrl: 'https://bpando.org/x', coverUrl: 'https://bpando.org/x.jpg', detailImageUrls: []}],
      download: async (url, destBase) => {
        const filePath = `${destBase}.jpg`;
        await writeFile(filePath, Buffer.from('x'));
        return {path: filePath, mediaType: 'image/jpeg', sha256: 'a'.repeat(64), byteLength: 1, width: 800, height: 600, sourceUrl: url};
      },
      makeContactSheet: async (_items, outPath) => { await writeFile(outPath, Buffer.from('g')); return {ok: true}; },
    },
  });
  assert.deepEqual(results, []);
});

test('rankHuabanPins strips watermarked material_id stock and promo noise, ranks by repin_count + curated sources', () => {
  const ranked = rankHuabanPins([
    {pin_id: 1, extra: {material_id: 99}, repin_count: 999, file: {key: 'k1', width: 1000, height: 1000}, raw_text: '带水印正版素材'},
    {pin_id: 2, extra: null, repin_count: 500, file: {key: 'k2', width: 1000, height: 1400}, raw_text: '奶茶新品促销手机海报模板'},
    {pin_id: 3, extra: null, repin_count: 60, like_count: 5, source: 'random.site', file: {key: 'k3', width: 800, height: 1000}, raw_text: '普通玻璃瓶'},
    {pin_id: 4, extra: null, repin_count: 220, like_count: 12, source: 'xiaohongshu.com', file: {key: 'k4', width: 1080, height: 1440}, raw_text: '光瓶酒极简包装设计'},
  ]);
  assert.deepEqual(ranked.map(p => p.pin_id), [4, 3]);
});

test('searchHuaban, searchDuitang, searchYellowtrace, and searchGooood parse verified structures cleanly', async () => {
  const hb = await searchHuaban('光瓶酒 包装设计', {
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        pins: [
          {pin_id: 10, extra: {material_id: 1}, file: {key: 'skip', width: 1000, height: 1000}},
          {pin_id: 11, extra: null, repin_count: 300, like_count: 10, source: 'xiaohongshu.com', raw_text: '极简白州酒瓶', file: {key: 'goodkey', width: 1080, height: 1440}},
        ],
      }),
    }),
  });
  assert.equal(hb.length, 1);
  assert.equal(hb[0].source, '花瓣·小红书');
  assert.equal(hb[0].coverUrl, 'https://gd-hbimg.huaban.com/goodkey_fw1200webp');

  const dt = await searchDuitang('极简 酒瓶', {
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        data: {object_list: [{id: 1, favorite_count: 50, msg: '极简玻璃瓶', photo: {path: 'https://dt.example/bottle.jpg', width: 900, height: 700}}]},
      }),
    }),
  });
  assert.equal(dt.length, 1);
  assert.equal(dt[0].source, '堆糖');

  const yt = await searchYellowtrace('retail bar', {
    fetcher: async () => ({
      ok: true,
      json: async () => ([{
        link: 'https://www.yellowtrace.com.au/monc/',
        title: {rendered: 'Monc Retail'},
        content: {rendered: '<img src="https://assets.yellowtrace.com.au/wp-content/uploads/2026/09/monc.jpg">'},
      }]),
    }),
  });
  assert.equal(yt.length, 1);
  assert.equal(yt[0].source, 'Yellowtrace');

  const gd = await searchGooood('快闪', {
    fetcher: async () => ({
      ok: true,
      text: async () => '<img src="https://oss.gooood.cn/uploads/2026/10/1-fwx.jpg"><img src="https://oss.gooood.cn/uploads/2026/10/popup-space.jpg">',
    }),
  });
  assert.equal(gd.length, 1);
  assert.equal(gd[0].coverUrl, 'https://oss.gooood.cn/uploads/2026/10/popup-space.jpg');
});
