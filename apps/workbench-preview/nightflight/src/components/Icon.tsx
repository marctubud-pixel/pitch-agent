/** 线性图标：统一 24 格、1.6 描边，颜色跟随文字。 */

const PATHS = {
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  library: 'M4 5h16v4H4z M5.5 9v10h13V9 M9.5 13h5',
  plus: 'M12 5v14 M5 12h14',
  chat: 'M4 5h16v11h-9l-4 4v-4H4z',
  log: 'M4 5h16v14H4z M7.5 10l3 2.5-3 2.5 M12.5 15H17',
  skip: 'M5 6.5l6.5 5.5L5 17.5z M12.5 6.5L19 12l-6.5 5.5z',
  alert: 'M12 4.5L21 19.5H3z M12 10.5v4.5 M12 17.3v.2',
  new: 'M5 5h14v14H5z M12 9v6 M9 12h6',
  home: 'M4 11.5l8-7 8 7 M6.5 10v9.5h11V10',
  doc: 'M7 3.5h7l4 4V20.5H7z M14 3.5v4h4 M10 12.5h5 M10 16h5',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M9 9.2v.1',
  deck: 'M3.5 5h17v11h-17z M12 16v4 M8 20h8',
  check: 'M5 12.5l4.5 4.5L19 7',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  menu: 'M5 7h14 M5 12h14 M5 17h14',
  eye: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z M12 10v4',
  layers: 'M12 4l8 4-8 4-8-4z M4 12l8 4 8-4 M4 16l8 4 8-4',
  clip: 'M8 12.5l5.5-5.5a3 3 0 0 1 4.2 4.2L10 19a4.5 4.5 0 0 1-6.4-6.4L11 5.2',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`ico ${className}`} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** 按文件类型选图标 */
export function iconForType(type: string): IconName {
  if (/图片|视觉/.test(type)) return 'image';
  if (/提案|演示文稿|PPT/.test(type)) return 'deck';
  return 'doc';
}
