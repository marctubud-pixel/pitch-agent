/**
 * WorkBot's character: a chartreuse file folder with a rounded tab, a white paper edge, big eyes
 * behind round glasses, and simple dark arms and feet. Redrawn as flat SVG from the approved
 * reference, with every part in its own group so CSS can animate it.
 *
 * The expression comes only from `mood`, which the conversation panel derives from the real
 * request lifecycle. Motion is decoration: every mood has a still pose under reduced motion
 * (workbot.css), and the interface always states the same thing in text.
 */
export type WorkBotMood = 'idle' | 'welcome' | 'thinking' | 'ack' | 'error';
/** Small idle gestures, played one at a time while nothing else is going on. */
export type WorkBotAct = 'look-left' | 'look-right' | 'wave' | 'stretch' | 'hop' | 'tap' | null;

const INK = 'var(--wbc-ink)';
/** Arms and feet sit on the page, so they get their own colour that stays visible in dark mode. */
const LIMB = 'var(--wbc-limb)';

export function WorkBotCharacter({ mood = 'idle', act = null, height = 64, className = '' }: { mood?: WorkBotMood; act?: WorkBotAct; height?: number; className?: string }) {
  // viewBox is 106 × 78, so the width follows the height.
  return (
    <svg className={`wbc ${className}`} data-mood={mood} data-act={(mood === 'idle' && act) || undefined} width={Math.round((height * 106) / 78)} height={height} viewBox="5 1 106 78" aria-hidden="true" focusable="false">
      <g className="wbc__figure">
        <g className="wbc__feet" fill={LIMB}>
          <rect x="43.8" y="60" width="7.2" height="10" rx="1" />
          <rect x="66.2" y="60" width="7.2" height="10" rx="1" />
          <ellipse cx="45.6" cy="71.6" rx="7.6" ry="3.7" />
          <ellipse cx="72.4" cy="71.6" rx="7.4" ry="3.7" />
        </g>
        <g className="wbc__arm wbc__arm--left">
          <path d="M22.2 44.2 C15 46.6 10.6 52.4 11.6 58.8" fill="none" stroke={LIMB} strokeWidth="5.4" strokeLinecap="round" />
        </g>
        <g className="wbc__arm wbc__arm--right">
          <path d="M98.4 50.6 C103.6 49.8 106.8 46.6 107 41.8" fill="none" stroke={LIMB} strokeWidth="5.4" strokeLinecap="round" />
        </g>
        <g className="wbc__folder" stroke={INK} strokeWidth="1.5" strokeLinejoin="round">
          {/* back cover and the paper inside it */}
          <path className="wbc__back" d="M49.6 11.4 L92.4 8.4 C94.3 8.3 95.2 9.3 95.1 11.2 L94.6 20 L50.6 18 Z" />
          <path className="wbc__paper" d="M51 13.2 L90.8 11.2 C91.8 11.2 92.3 11.8 92.2 12.8 L91.9 18.8 L51.6 17.4 Z" />
          {/* front: rounded tab top-left, flap edge, slightly tapered right side */}
          <path
            className="wbc__front"
            d="M27.4 7.2 L43 5.8 C45 5.6 46.6 6.6 47.4 8.6 L49.8 15.2 C50.3 16.4 51.1 16.9 52.4 17 L97.4 18.8 C100.1 18.9 101.6 20.6 101.4 23.3 L97.6 58.4 C97.3 61.2 95.6 62.8 92.8 62.8 L26.2 62.5 C23.5 62.5 21.9 60.9 21.8 58.2 L22.5 12.3 C22.6 9.3 24.4 7.5 27.4 7.2 Z"
          />
        </g>
        <g className="wbc__eyes">
          <g className="wbc__eye wbc__eye--left">
            <ellipse className="wbc__white" cx="48.4" cy="40" rx="8.4" ry="9.6" />
            <ellipse className="wbc__pupil" cx="51.6" cy="39.4" rx="3.2" ry="5.4" fill={INK} />
          </g>
          <g className="wbc__eye wbc__eye--right">
            <ellipse className="wbc__white" cx="78" cy="40.2" rx="8.4" ry="9.6" />
            <ellipse className="wbc__pupil" cx="79.4" cy="40.4" rx="3.2" ry="5.4" fill={INK} />
          </g>
        </g>
        <g className="wbc__glasses" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round">
          <circle cx="47.5" cy="40" r="11.6" />
          <circle cx="77" cy="40.2" r="11.6" />
          <path d="M59 39.2 C60.6 37.2 63.2 37.2 65.4 39.2" />
          <path d="M35.9 36.4 L34.2 36.2" />
          <path d="M88.6 40.6 L90.2 40.6" />
        </g>
      </g>
    </svg>
  );
}
