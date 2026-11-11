/**
 * Presents a piece of artwork in a box without distorting what it is.
 *
 * - Pictures (scenes) are photographs and illustrations: they may be cropped to fill a box.
 * - Posters, packs and placement mockups are whole objects with their own proportions (posters in
 *   standard print ratios: 9:16, 3:4, 4:3, 16:9). They are never cropped or squeezed:
 *   - with no box given, the frame takes the object's own ratio;
 *   - when the layout imposes a box of another shape (`ratio`, or `fill` for a box sized by its
 *     parent), the object sits whole on a mat, with a soft shadow, like a print pinned to a wall.
 */
import type { CSSProperties } from 'react';
import type { ArtSpec } from '../../domain/proposal';
import { Art, artBox } from './Art';

export const isWhole = (spec: ArtSpec) => spec.kind !== 'scene';

/** The object's own ratio as [w, h]. */
export const naturalRatio = (spec: ArtSpec): [number, number] => artBox(spec);

export function ArtFrame({
  spec,
  title,
  ratio,
  fill = false,
  className = '',
  style,
}: {
  spec: ArtSpec;
  title?: string;
  /** The box the layout imposes. Omit to use the artwork's own ratio. */
  ratio?: [number, number];
  /** The parent sizes the box (both width and height). */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [w, h] = artBox(spec);
  const whole = isWhole(spec);
  const box = ratio ? ratio[0] / ratio[1] : null;
  const mismatch = box !== null && Math.abs(box - w / h) / (w / h) > 0.04;
  const mat = whole && (fill || mismatch);
  // --r is the artwork's own width-to-height ratio, for layouts that size boxes from it.
  const frameStyle = (fill ? { '--r': w / h, ...style } : { '--r': w / h, aspectRatio: ratio && (mat || !whole) ? `${ratio[0]} / ${ratio[1]}` : `${w} / ${h}`, ...style }) as CSSProperties;
  return (
    <span className={`art-frame ${className}`} data-mat={mat || undefined} data-fill={fill || undefined} data-kind={spec.kind} style={frameStyle}>
      {whole ? <Art spec={spec} title={title} round={mat ? 6 : undefined} /> : <Art spec={spec} title={title} fit="slice" ratio={fill ? undefined : ratio} />}
    </span>
  );
}
