import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onOpenFilters: () => void;
  activeCount: number;
  placeholder?: string;
}

/** Поиск (debounce 300 мс) и единственная кнопка «Фильтр» с бейджем числа активных групп. */
export default function SearchBar({ value, onChange, onOpenFilters, activeCount, placeholder = "Поиск…" }: Props) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => { if (value !== last.current) { setText(value); last.current = value; } }, [value]);
  useEffect(() => {
    if (text === last.current) return;
    const t = setTimeout(() => { last.current = text; cb.current(text); }, 300);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div className="d-flex gap-2">
      <div className="input-group">
        <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
        <input className="form-control" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      </div>
      <button type="button" className="btn btn-outline-primary text-nowrap" onClick={onOpenFilters}>
        <i className="bi bi-funnel me-1" />Фильтр
        {activeCount > 0 && <span className="badge bg-primary ms-2">{activeCount}</span>}
      </button>
    </div>
  );
}
