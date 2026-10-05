import { useEffect, useRef, useState } from 'react';
import { ColumnsIcon } from '../Icons';

export interface ColumnDef<T extends string = string> {
  key: T;
  label: string;
}

export function useColumnVisibility<T extends string>(
  storageKey: string,
  columns: ColumnDef<T>[],
  defaultVisible?: Partial<Record<T, boolean>>
) {
  const initial = (): Record<T, boolean> => {
    const fallback: Record<string, boolean> = {};
    columns.forEach((c) => {
      fallback[c.key] = defaultVisible?.[c.key] ?? true;
    });
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return fallback as Record<T, boolean>;
      const parsed = JSON.parse(raw);
      return { ...fallback, ...parsed } as Record<T, boolean>;
    } catch {
      return fallback as Record<T, boolean>;
    }
  };

  const [visible, setVisible] = useState<Record<T, boolean>>(initial);

  const toggle = (key: T) => {
    setVisible((prev) => {
      const currentActive = Object.values(prev).filter(Boolean).length;
      if (prev[key] && currentActive <= 1) return prev; // keep at least 1
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const reset = () => {
    const fallback: Record<string, boolean> = {};
    columns.forEach((c) => {
      fallback[c.key] = defaultVisible?.[c.key] ?? true;
    });
    setVisible(fallback as Record<T, boolean>);
    try {
      localStorage.setItem(storageKey, JSON.stringify(fallback));
    } catch {}
  };

  const activeCount = columns.filter((c) => visible[c.key]).length;

  return {
    visible,
    visibleCols: visible,
    toggle,
    toggleCol: toggle,
    reset,
    resetCols: reset,
    activeCount,
  };
}

export function ColumnPicker<T extends string>({
  columns,
  visible,
  visibleCols,
  onToggle,
  onReset,
  activeCount,
}: {
  columns: ColumnDef<T>[];
  visible?: Record<T, boolean>;
  visibleCols?: Record<T, boolean>;
  onToggle: (key: T) => void;
  onReset: () => void;
  activeCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentVisible = visible ?? visibleCols ?? ({} as Record<T, boolean>);
  const count = activeCount ?? columns.filter((c) => currentVisible[c.key]).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div className="col-picker-wrap" ref={ref}>
      <button
        type="button"
        className={`col-picker-btn ${open ? 'is-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Jadval ustunlarini ko'rsatish/yashirish"
      >
        <ColumnsIcon />
        <span>Ustunlar</span>
      </button>

      {open && (
        <div className="col-picker-popover">
          <div className="col-picker-header">
            <span>Ustunlar ({count}/{columns.length})</span>
            <button type="button" className="col-picker-reset" onClick={onReset}>
              Hammasi
            </button>
          </div>
          <div className="col-picker-list">
            {columns.map((col) => (
              <label key={col.key} className="col-picker-item">
                <input
                  type="checkbox"
                  checked={!!currentVisible[col.key]}
                  onChange={() => onToggle(col.key)}
                  disabled={currentVisible[col.key] && count <= 1}
                />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
