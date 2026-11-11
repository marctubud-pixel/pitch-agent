/** Each project keeps its folder colour everywhere: on the home cabinet and in its own header. */
export type Tone = 'peach' | 'lime' | 'lilac' | 'sky' | 'butter';

/** Seeded projects have chosen colours; new ones get a stable pick from their ID. */
const SEEDED: Record<string, Tone> = { northline: 'lime', plumtide: 'peach', luma: 'butter', morrow: 'lilac' };
const ROTATION: Tone[] = ['sky', 'lilac', 'peach', 'lime', 'butter'];

export function toneFor(id: string): Tone {
  if (SEEDED[id]) return SEEDED[id];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ROTATION[h % ROTATION.length];
}
