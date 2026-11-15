import { useId, useRef, useState, type ReactNode } from 'react';
import './visual-image-gallery.css';

export interface GalleryImage { src: string; title: string; alt: string }
export interface GalleryDirection {
  id: string; name: string;
  references: readonly GalleryImage[]; sketches: readonly GalleryImage[];
  main?: GalleryImage; mockup?: GalleryImage;
}

function Picture({ image }: { image: GalleryImage }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="vg-missing" role="status">图片暂未载入</span> :
    <img src={image.src} alt={image.alt} onError={() => setFailed(true)} />;
}

function CurrentArtwork({ direction, zoom }: { direction: GalleryDirection; zoom: (image: GalleryImage) => void }) {
  const [index, select] = useState(0);
  const sketch = direction.sketches[index] ?? direction.sketches[0];
  function art(image: GalleryImage | undefined, empty: string) {
    return image ? <button type="button" className="vg-zoom" aria-label={'放大' + image.title} aria-haspopup="dialog" onClick={() => zoom(image)}>
      <Picture key={image.src} image={image} />
    </button> : <p className="vg-missing" role="status">{empty}</p>;
  }
  return <>
    <section className="vg-section" data-visual-direction={direction.id}>
      <h3>草图与主视觉 · {direction.name}</h3>
      <div className="vg-pair">
        <figure><figcaption>构图草图</figcaption>{art(sketch, '草图待交回')}
          {direction.sketches.length > 1 && <div className="vg-sketch-choices" role="group" aria-label="切换构图草图">
            {direction.sketches.map((image, i) => <button key={image.src} type="button" aria-pressed={image === sketch}
              aria-label={'查看' + image.title} onClick={() => select(i)}><Picture image={image} /></button>)}
          </div>}
        </figure>
        <figure><figcaption>主视觉</figcaption>{art(direction.main, '主视觉待交回')}</figure>
      </div>
    </section>
    <section className="vg-section vg-mockup"><h3>样机 · {direction.name}</h3>{art(direction.mockup, '样机待交回')}</section>
  </>;
}

export function VisualImageGallery({ directions, currentId, onDirectionChange, details }: {
  directions: readonly GalleryDirection[]; currentId: string; onDirectionChange: (id: string) => void; details?: ReactNode;
}) {
  const current = directions.find((d) => d.id === currentId) ?? directions[0];
  const [enlarged, setEnlarged] = useState<GalleryImage>();
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  function zoom(image: GalleryImage) {
    setEnlarged(image);
    dialog.current?.showModal();
  }
  if (!current) return <p className="vg-missing">视觉稿待交回</p>;
  return <div className="visual-image-gallery">
    <section className="vg-section"><h3>方向参考</h3>
      {directions.map((direction) => <div className="vg-reference-row" data-reference-direction={direction.id} key={direction.id}>
        <button type="button" className="vg-direction" aria-pressed={current.id === direction.id}
          onClick={() => onDirectionChange(direction.id)}>{direction.name}</button>
        <div className="vg-references">{direction.references.length ? direction.references.map((image) =>
          <figure key={image.src}><button type="button" className="vg-zoom" aria-label={'放大' + image.title}
            aria-haspopup="dialog" onClick={() => zoom(image)}><Picture image={image} /></button>
            <figcaption>{image.title}</figcaption></figure>) : <p className="vg-missing">参考图待补</p>}</div>
      </div>)}
    </section>
    <CurrentArtwork key={current.id} direction={current} zoom={zoom} />
    {details && <details key={'notes-' + current.id} className="vg-details"><summary>评审与说明 · {current.name}</summary>{details}</details>}
    <dialog ref={dialog} className="vg-dialog" aria-labelledby={headingId}
      onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      {enlarged && <div><header><h3 id={headingId}>{enlarged.title}</h3>
        <button type="button" autoFocus onClick={() => dialog.current?.close()}>关闭</button></header>
        <Picture key={enlarged.src} image={enlarged} /></div>}
    </dialog>
  </div>;
}
