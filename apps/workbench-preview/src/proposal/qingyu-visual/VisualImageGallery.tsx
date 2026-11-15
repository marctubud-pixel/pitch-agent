import { useId, useRef, useState, type ReactNode } from 'react';
import './visual-image-gallery.css';

export interface GalleryImage { src: string; title: string; alt: string }
export interface GalleryDirection {
  id: string; name: string; description?: string;
  references: readonly GalleryImage[]; sketch?: GalleryImage;
  mains: readonly GalleryImage[]; extensions?: readonly GalleryImage[];
  format?: 'portrait' | 'landscape'; extensionLabel?: string;
  mockup?: GalleryImage;
}

function Picture({ image, loaded }: { image: GalleryImage; loaded?: (image: HTMLImageElement) => void }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="vg-missing" role="status">图片暂未载入</span> :
    <img src={image.src} alt={image.alt} onLoad={event => loaded?.(event.currentTarget)} onError={() => setFailed(true)} />;
}

type Zoom = (image: GalleryImage) => void;

function Artwork({ images, label, zoom, loaded, rowRatio, showCaption = true }: {
  images: readonly GalleryImage[]; label: string; showCaption?: boolean; rowRatio?: number; zoom: Zoom; loaded?: (image: HTMLImageElement, index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [ratio, setRatio] = useState<number>();
  const image = images[index] ?? images[0];
  const displayRatio = rowRatio || (images.length > 1 ? ratio : undefined);
  if (!image) return <figure><figcaption className="vg-missing">{label}待补</figcaption></figure>;
  return <figure>
    <button type="button" className="vg-zoom" style={displayRatio ? { aspectRatio: displayRatio } : undefined} aria-label={'放大' + image.title} aria-haspopup="dialog" onClick={() => zoom(image)}>
      <Picture key={image.src} image={image} loaded={element => {
        if (index === 0 && images.length > 1) setRatio(element.naturalWidth / element.naturalHeight);
        loaded?.(element, index);
      }} />
    </button>
    {showCaption && <figcaption>{label}
      {images.length > 1 && <span className="vg-pager">
        <button type="button" aria-label={label + '上一张'} onClick={() => setIndex((index + images.length - 1) % images.length)}>←</button>
        <span aria-live="polite">{index + 1} / {images.length}</span>
        <button type="button" aria-label={label + '下一张'} onClick={() => setIndex((index + 1) % images.length)}>→</button>
      </span>}
    </figcaption>}
  </figure>;
}

function CurrentArtwork({ direction, letter, zoom }: { direction: GalleryDirection; letter: string; zoom: Zoom }) {
  const [measuredPortrait, setMeasuredPortrait] = useState(false);
  const [rowRatio, setRowRatio] = useState(0);
  function measure(image: HTMLImageElement) {
    const aspect = image.naturalWidth / image.naturalHeight;
    setRowRatio(previous => Math.max(previous, aspect));
  }
  const portrait = direction.format ? direction.format === 'portrait' : measuredPortrait;
  const extensionLabel = direction.extensionLabel ?? '延展图';
  const extension = <Artwork label={extensionLabel} rowRatio={portrait ? rowRatio : undefined} loaded={portrait ? measure : undefined} images={direction.extensions ?? []} zoom={zoom} />;
  return <>
    <section className="vg-section" data-visual-direction={direction.id}>
      <h3>草图与主视觉 <span className="vg-letter">方向 {letter}</span></h3>
      <div className={'vg-pair' + (portrait ? ' vg-portrait' : '')}>
        <Artwork label="构图草图" rowRatio={rowRatio} loaded={measure} images={direction.sketch ? [direction.sketch] : []} zoom={zoom} />
        <Artwork label="主视觉" rowRatio={rowRatio} images={direction.mains} zoom={zoom}
          loaded={(image, index) => {
            measure(image);
            if (index === 0) setMeasuredPortrait(image.naturalHeight > image.naturalWidth);
          }} />
        {portrait && extension}
      </div>
    </section>
    {!portrait && <section className="vg-section vg-extension"><h3>{extensionLabel}</h3>{extension}</section>}
    <section className="vg-section vg-mockup"><h3>样机 <span className="vg-letter">方向 {letter}</span></h3>
      {direction.mockup ? <Artwork showCaption={false} label="样机" images={[direction.mockup]} zoom={zoom} /> : <p className="vg-missing">样机待交回</p>}
    </section>
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
    <section className="vg-section"><h3>视觉参考</h3>
      {directions.map((direction, index) => <div className="vg-reference-row" data-reference-direction={direction.id} key={direction.id}>
        <button type="button" className="vg-direction" aria-pressed={current.id === direction.id}
          onClick={() => onDirectionChange(direction.id)}>
          <span className="vg-letter">方向 {String.fromCharCode(65 + index)}</span>
          <strong>{direction.name}</strong>
          {direction.description && <span className="vg-description">{direction.description}</span>}
        </button>
        <div className="vg-references">{direction.references.length ? direction.references.map((image) =>
          <button key={image.src} type="button" className="vg-zoom" aria-label={'放大' + image.title}
            aria-haspopup="dialog" onClick={() => zoom(image)}><Picture image={image} /></button>) : <p className="vg-missing">参考图待补</p>}</div>
      </div>)}
    </section>
    <CurrentArtwork key={current.id} direction={current} letter={String.fromCharCode(65 + directions.indexOf(current))} zoom={zoom} />
    {details && <details key={'notes-' + current.id} className="vg-details"><summary>评审与说明 · {current.name}</summary>{details}</details>}
    <dialog ref={dialog} className="vg-dialog" aria-labelledby={headingId}
      onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      {enlarged && <div><header><h3 id={headingId}>{enlarged.title}</h3>
        <button type="button" autoFocus onClick={() => dialog.current?.close()}>关闭</button></header>
        <Picture key={enlarged.src} image={enlarged} /></div>}
    </dialog>
  </div>;
}
