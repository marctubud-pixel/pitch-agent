import { useId, useRef, useState, type ReactNode } from 'react';
import './visual-image-gallery.css';

export interface GalleryImage {
  src: string;
  title: string;
  alt: string;
  candidate?: number;
  sha256?: string;
  sourceSha256?: string;
  label?: string;
}
export interface GalleryDirection {
  id: string; name: string; description?: string;
  references: readonly GalleryImage[]; sketch?: GalleryImage;
  auxiliaryMissing?: boolean;
  mains: readonly GalleryImage[]; extensions?: readonly GalleryImage[];
  batchSummary?: string;
  format?: 'portrait' | 'landscape'; extensionLabel?: string; mockupLabel?: string;
  sketchComparison?: { previous: GalleryImage; note: string };
  mockup?: GalleryImage;
  mockups?: readonly GalleryImage[];
}

function matchDerivative(list: readonly GalleryImage[], activeMain: GalleryImage | undefined, mainIndex: number): GalleryImage | undefined {
  if (!list.length) return undefined;
  if (activeMain?.sha256) {
    const byHash = list.find((img) => img.sourceSha256 === activeMain.sha256);
    if (byHash) return byHash;
  }
  if (activeMain?.candidate != null) {
    const byCandidate = list.find((img) => img.candidate === activeMain.candidate);
    if (byCandidate) return byCandidate;
  }
  const hasExplicitMapping = list.some((img) => img.candidate != null || Boolean(img.sourceSha256));
  if (!hasExplicitMapping && list.length > 1 && list[mainIndex]) {
    return list[mainIndex];
  }
  return list[0];
}

function Picture({ image, loaded }: { image: GalleryImage; loaded?: (image: HTMLImageElement) => void }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="vg-missing" role="status">图片暂未载入</span> :
    <img src={image.src} alt={image.alt} onLoad={event => loaded?.(event.currentTarget)} onError={() => setFailed(true)} />;
}

type Zoom = (image: GalleryImage) => void;

function Artwork({ images, label, zoom, loaded, rowRatio, fixedFrame = false, showCaption = true, controlledIndex, onIndexChange }: {
  images: readonly GalleryImage[]; label: string; showCaption?: boolean; rowRatio?: number; fixedFrame?: boolean; zoom: Zoom; loaded?: (image: HTMLImageElement, index: number) => void;
  controlledIndex?: number; onIndexChange?: (next: number) => void;
}) {
  const [internalIndex, setInternalIndex] = useState(0);
  const index = controlledIndex ?? internalIndex;
  const setIndex = onIndexChange ?? setInternalIndex;
  const [ratio, setRatio] = useState<number>();
  const image = images[index] ?? images[0];
  const displayRatio = fixedFrame ? undefined : (rowRatio || (images.length > 1 ? ratio : undefined));
  if (!image) return <figure><figcaption className="vg-missing">{label}待补</figcaption></figure>;
  return <figure>
    <button type="button" className="vg-zoom" style={displayRatio ? { aspectRatio: displayRatio } : undefined} aria-label={'放大' + image.title} aria-haspopup="dialog" onClick={() => zoom(image)}>
      <Picture key={image.src} image={image} loaded={element => {
        if (index === 0 && images.length > 1) setRatio(element.naturalWidth / element.naturalHeight);
        loaded?.(element, index);
      }} />
    </button>
    {showCaption && <figcaption>{images.length > 1 ? label + ' · ' + image.title : label}
      {images.length > 1 && <span className="vg-pager">
        <button type="button" aria-label={label + '上一张'} onClick={() => setIndex((index + images.length - 1) % images.length)}>←</button>
        <span aria-live="polite">{index + 1} / {images.length}</span>
        <button type="button" aria-label={label + '下一张'} onClick={() => setIndex((index + 1) % images.length)}>→</button>
      </span>}
    </figcaption>}
  </figure>;
}

function CurrentArtwork({ direction, directions, letter, onDirectionChange, zoom, hideEmptySlots = false }: {
  direction: GalleryDirection; directions: readonly GalleryDirection[]; letter: string; onDirectionChange: (id: string) => void; zoom: Zoom; hideEmptySlots?: boolean;
}) {
  const [mainIndex, setMainIndex] = useState(0);
  const [measuredPortrait, setMeasuredPortrait] = useState(false);
  const [rowRatio, setRowRatio] = useState(0);
  function measure(image: HTMLImageElement) {
    const aspect = image.naturalWidth / image.naturalHeight;
    setRowRatio(previous => Math.max(previous, aspect));
  }
  const activeMain = direction.mains[mainIndex] ?? direction.mains[0];
  const allExtensions = direction.extensions ?? [];
  const allMockups = direction.mockups?.length ? direction.mockups : direction.mockup ? [direction.mockup] : [];
  const syncedExtension = matchDerivative(allExtensions, activeMain, mainIndex);
  const syncedMockup = matchDerivative(allMockups, activeMain, mainIndex);

  const portrait = direction.format ? direction.format === 'portrait' : measuredPortrait;
  const extensionLabel = syncedExtension?.label ?? direction.extensionLabel ?? '延展图';
  const mockupLabel = syncedMockup?.label ?? direction.mockupLabel ?? '样机';
  const hasExtensions = Boolean(syncedExtension || allExtensions.length);
  const showExtension = hasExtensions || !hideEmptySlots;
  const sideBySideNoSketch = !direction.sketch && showExtension;
  const inlineExtension = showExtension && (portrait || !direction.sketch);
  const useUniformFrame = sideBySideNoSketch;

  const extensionImages = syncedExtension ? [syncedExtension] : allExtensions;
  const extension = showExtension ? (
    <Artwork
      key={syncedExtension?.src ?? 'ext-empty'}
      label={extensionLabel}
      fixedFrame={useUniformFrame}
      rowRatio={inlineExtension && !useUniformFrame ? rowRatio : undefined}
      loaded={inlineExtension && !useUniformFrame ? measure : undefined}
      images={extensionImages}
      zoom={zoom}
    />
  ) : null;

  const pairCount = Number(Boolean(direction.sketch)) + 1 + Number(Boolean(inlineExtension));
  const pairClass =
    'vg-pair' +
    (pairCount === 3 ? ' vg-portrait' : pairCount === 1 ? ' vg-single' : '') +
    (useUniformFrame ? ' vg-balanced' : '');
  const sectionTitle = direction.sketch
    ? '草图与主视觉'
    : inlineExtension
      ? '主视觉与延展'
      : '主视觉';

  return <>
    <section className="vg-section" data-visual-direction={direction.id}>
      <h3>
        {sectionTitle}
        {directions.length > 1 ? (
          <span className="vg-dir-inline" role="tablist" aria-label="切换创意方向">
            {directions.map((item, idx) => {
              const tabLetter = String.fromCharCode(65 + idx);
              const active = item.id === direction.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={item.name}
                  className={'vg-dir-inline-btn' + (active ? ' is-active' : '')}
                  onClick={() => onDirectionChange(item.id)}
                >
                  方向 {tabLetter}
                </button>
              );
            })}
          </span>
        ) : (
          <> <span className="vg-letter">方向 {letter}</span></>
        )}
      </h3>
      <div className={pairClass}>
        {direction.sketch && <Artwork label="构图草图" rowRatio={rowRatio} loaded={measure} images={[direction.sketch]} zoom={zoom} />}
        <Artwork
          label="主视觉"
          fixedFrame={useUniformFrame}
          rowRatio={useUniformFrame ? undefined : rowRatio}
          images={direction.mains}
          controlledIndex={mainIndex}
          onIndexChange={setMainIndex}
          zoom={zoom}
          loaded={(image, index) => {
            if (!useUniformFrame) measure(image);
            if (index === 0) setMeasuredPortrait(image.naturalHeight > image.naturalWidth);
          }}
        />
        {inlineExtension && extension}
      </div>
      {direction.sketchComparison && direction.sketch && <details className="vg-details vg-sketch-history">
        <summary>对照草图原稿与采用稿</summary>
        <div className="vg-pair">
          <Artwork label={direction.sketchComparison.previous.title} images={[direction.sketchComparison.previous]} zoom={zoom} />
          <Artwork label="采用稿" images={[direction.sketch]} zoom={zoom} />
        </div>
        <p>{direction.sketchComparison.note}</p>
      </details>}
    </section>
    {!inlineExtension && showExtension && <section className="vg-section vg-extension"><h3>{extensionLabel}</h3>{extension}</section>}
    {(syncedMockup || !hideEmptySlots) && (
      <section className="vg-section vg-mockup">
        <h3>
          {mockupLabel} <span className="vg-letter">方向 {letter}{activeMain?.candidate ? ` · 第 ${activeMain.candidate} 稿` : ''}</span>
        </h3>
        {syncedMockup ? (
          <Artwork key={syncedMockup.src} showCaption={false} label={mockupLabel} images={[syncedMockup]} zoom={zoom} />
        ) : (
          <p className="vg-missing">样机待交回</p>
        )}
      </section>
    )}
  </>;
}

export function VisualImageGallery({ directions, currentId, onDirectionChange, details, hideEmptySlots = false }: {
  directions: readonly GalleryDirection[]; currentId: string; onDirectionChange: (id: string) => void; details?: ReactNode; hideEmptySlots?: boolean;
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
            aria-haspopup="dialog" onClick={() => zoom(image)}><Picture image={image} /></button>) : <p className="vg-missing">参考图待补</p>}
          {direction.auxiliaryMissing && <p className="vg-missing">辅助参考待补</p>}
        </div>
      </div>)}
    </section>
    <CurrentArtwork key={current.id} direction={current} directions={directions} letter={String.fromCharCode(65 + directions.indexOf(current))} onDirectionChange={onDirectionChange} zoom={zoom} hideEmptySlots={hideEmptySlots} />
    {details && <details key={'notes-' + current.id} className="vg-details"><summary>评审与说明 · {current.name}</summary>{details}</details>}
    <dialog ref={dialog} className="vg-dialog" aria-labelledby={headingId}
      onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      {enlarged && <div><header><h3 id={headingId}>{enlarged.title}</h3>
        <button type="button" autoFocus onClick={() => dialog.current?.close()}>关闭</button></header>
        <Picture key={enlarged.src} image={enlarged} /></div>}
    </dialog>
  </div>;
}
