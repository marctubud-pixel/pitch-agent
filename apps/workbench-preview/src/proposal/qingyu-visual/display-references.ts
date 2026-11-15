import { packagingReferenceSet, type PackagingReference } from './packaging-references';

// Two references per direction belong to the archived selection. The third is
// an existing Qingyu research image or a separately photographed series view.
const additionalReferences: Record<PackagingReference['directionId'], PackagingReference> = {
  n7: {
    id: 'display-chun-wulong', directionId: 'n7', title: '淳茶舍 · 冷萃乌龙茶',
    image: '/research-case/qingyu-r3-20261109/chun-wulong.png',
    imageUrl: 'https://www.coca-cola.com/content/dam/onexp/cn/zh/2025productupdate/wulongcha_250102.png',
    sourceUrl: 'https://www.coca-cola.com/cn/zh/brands/authentic-tea-house-ath',
    sourceName: '可口可乐中国官网', form: '官网单品图', scope: '同品类参考', market: '中国大陆',
    alt: '淳茶舍冷萃乌龙茶，琥珀色瓶身上分列品牌与品名',
    borrow: '与茉莉款并看，可以看出品种变化时品牌名和茶名仍各有固定位置。',
    limits: '沿用青屿研究 R4 原图 C-A04，仅用于比较信息层级。',
    sha256: 'ba10aeb0fa05a5b03a98feb2c815a21b447f19874ad1dc8ee9f1e430db3b9622',
    width: 2267, height: 2267,
  },
  k4: {
    id: 'display-inikin-moli', directionId: 'k4', title: '伊刻活泉 · 现泡茉莉花茶',
    image: '/research-case/qingyu-r3-20261109/inikin-02.jpg',
    imageUrl: 'https://static.foodtalks.cn/cms/entry/form/7c509f8c34697d5947e9cdf1a5e3c412f795.jpg',
    sourceUrl: 'https://www.foodtalks.cn/fbifwowfoodawards/gallery/wowfood/detail/5563',
    sourceName: '伊利／FBIF 品牌投稿', form: '品牌投稿单品图', scope: '同品类参考', market: '中国大陆',
    alt: '伊刻活泉现泡茉莉花茶单瓶，绿色瓶标和浅色瓶身',
    borrow: '观察绿色标签与透明瓶身的留白，为水流窗口的构图找参照。',
    limits: '沿用青屿研究 R4 原图 C-A02；青屿的配方事实独立核对。',
    sha256: '6e2c2e5c16220de458d040b9287802d149d0dc0a62a79910c71dd134c2391324',
    width: 1920, height: 1080,
  },
  v2: {
    id: 'display-coke-share-series', directionId: 'v2', title: '可口可乐 · 分享瓶称呼系列',
    image: '/research-case/qingyu-packrefs-20261110/coke-share-03.jpg',
    imageUrl: 'https://www.coca-cola.com/content/dam/onexp/cn/zh/coke_share_bottle/coke_share_bottle_03.jpg',
    sourceUrl: 'https://www.coca-cola.com/cn/zh/media-center/Share-a-Coke',
    sourceName: '可口可乐中国官网', form: '官方系列全图', scope: '跨品类参考 · 碳酸饮料', market: '中国大陆',
    alt: '两排分享瓶在白底上并列呈现不同称呼',
    borrow: '对照同一瓶型上的不同称呼，看寄语怎样随收件人变化。',
    limits: '与两瓶近景属同一分享瓶项目，本张展示完整系列。',
    sha256: '96759d427d8c63f99fc381a3d74e5d704eb810cb09a7ca87f37241fb5807764e',
    width: 1600, height: 1200,
  },
};

export function displayReferences(directionId: string): readonly PackagingReference[] {
  const archived = packagingReferenceSet.references.filter((reference) => reference.directionId === directionId);
  if (!archived.length) return [];
  return [...archived, additionalReferences[archived[0].directionId]];
}
