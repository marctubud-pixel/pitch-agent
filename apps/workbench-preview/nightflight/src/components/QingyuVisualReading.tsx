import { VisualReview } from '../../../src/proposal/qingyu-visual/VisualReview';
import integration from '../../../src/proposal/qingyu-visual/integration-review.json';
import packagingReview from '../../../src/proposal/qingyu-visual/packaging-review.json';
import { VisualImageGallery } from '../../../src/proposal/qingyu-visual/VisualImageGallery';
import { qingyuGalleryDirections } from '../../../src/proposal/qingyu-visual/gallery-directions';
import { conceptImages } from '../../../src/proposal/qingyu-visual/concept-images';
import { displayReferences } from '../../../src/proposal/qingyu-visual/display-references';

const directions = qingyuGalleryDirections();

export default function QingyuVisualReading({ directionId }: { directionId: string | null }) {
  const current = directions.find(d => d.id === directionId) ?? directions[0];
  const concept = conceptImages.find(d => d.directionId === current.id)!;
  return <div className="sheet">
    <div className="sheet-bar"><a className="back-link" href="#/">← 回到提案台</a></div>
    <div className="sheet-scroll"><article className="sheet-doc">
      <header className="sheet-head"><p className="mono-label">青屿 · 本地设计试稿</p><h1>视觉开发</h1></header>
      <VisualImageGallery directions={directions} currentId={current.id}
        onDirectionChange={id => { location.hash = '/reference/qingyu/visual?dir=' + encodeURIComponent(id); }}
        details={<>
          {current.id === 'k4' && <>
            <h3>包装主视觉 · 工作台复评</h3>
            <p>{integration.winner ? '本批推荐第 '+integration.winner+' 稿，待采用。' : '本批暂无可采用稿。'}</p>
            <VisualReview board="/research-case/qingyu-visual-review/integration.png"
              order={['第 1 稿','第 2 稿','第 3 稿新版',...integration.references.map(r=>r.name==='inikin-02.jpg'?'伊刻活泉':r.name==='oriental-longjing.png'?'东方树叶':r.name)]} candidates={integration.candidates} />
            <details><summary>上一轮 · 第 2 稿与蓝岩新版对照</summary>
              <VisualReview board="/research-case/qingyu-visual-review/comparison.jpg"
                order={['第 2 稿','第 3 稿新版','伊刻活泉','东方树叶']} candidates={packagingReview} />
            </details>
          </>}
          <p>{concept.description}</p>
          <p>{concept.notes.join('')}</p>
          <p>本组为设计试稿，正式视觉评审与印前核验待完成。</p>
          {current.id === 'k4' && <p>选图小试：伊刻活泉作主参考，东方树叶辅助图文分区；长白雪的虎身叠山林留作备选，分享瓶侧重人际称呼，本方向退回。</p>}
          {displayReferences(current.id).map(ref => <p key={ref.id}>
            <strong>{ref.title}</strong>　{ref.borrow} {ref.limits} <a href={ref.sourceUrl} target="_blank" rel="noopener noreferrer">{ref.sourceName}</a>
          </p>)}
        </>} />
    </article></div>
  </div>;
}
