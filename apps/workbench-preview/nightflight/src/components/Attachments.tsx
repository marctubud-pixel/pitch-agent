import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { Library } from './Library';
import { ACCEPT, type Summary } from '../live';

interface ButtonProps {
  projects: Summary[];
  onAdd: (atts: File[]) => void;
  disabled?: boolean;
  disabledHint?: string;
  label?: string;
  /** 菜单向上还是向下展开 */
  drop?: 'up' | 'down';
  inputId: string;
}

export function AttachButton({
  projects,
  onAdd,
  disabled,
  disabledHint,
  label,
  drop = 'up',
  inputId,
}: ButtonProps) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className={`attach drop-${drop}`} ref={wrap}>
      <input
        ref={file}
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          if (list.length) onAdd(list);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        className={label ? 'btn' : 'attach-plus'}
        disabled={disabled}
        title={disabled ? disabledHint : '添加参考资料'}
        aria-label={label ? undefined : '添加参考资料'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label ? (
          <>
            <Icon name="clip" />
            {label}
          </>
        ) : (
          <Icon name="plus" size={18} />
        )}
      </button>
      {open && (
        <div className="attach-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              file.current?.click();
            }}
          >
            <strong>
              <Icon name="upload" />
              上传文件
            </strong>
            <span>PDF、文档、图片、演示文稿</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPicking(true);
            }}
          >
            <strong>
              <Icon name="library" />
              从比稿资料库选择
            </strong>
            <span>过往提案、研究、策略与视觉参考</span>
          </button>
          <p>文件会随消息或需求交给主理人。</p>
        </div>
      )}
      {picking &&
        createPortal(
          <div className="attach-library">
            <Library
              projects={projects}
              close={() => setPicking(false)}
              pick={(f) => {
                onAdd([f]);
                setPicking(false);
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

export function AttachmentChips({ items, remove }: { items: File[]; remove: (i: number) => void }) {
  return (
    <ul className="att-chips">
      {items.map((f, i) => (
        <li key={i} className="file-chip">
          {f.name}
          <button type="button" aria-label={'移除 ' + f.name} onClick={() => remove(i)}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
