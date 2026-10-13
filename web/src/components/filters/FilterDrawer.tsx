import { useEffect, useMemo, useState } from "react";
import type { Facets } from "../../api/list";

export type GroupDef =
  | { kind: "check"; key: string; label: string; searchable?: boolean }
  | { kind: "switch"; key: string; label: string; text: string }            // extras[key] = "1"
  | { kind: "daterange"; label: string; fromKey: string; toKey: string };

interface Props {
  open: boolean;
  onClose: () => void;
  groups: GroupDef[];
  facets: Facets;
  filters: Record<string, string[]>;
  extras: Record<string, string>;
  onApply: (f: Record<string, string[]>, e: Record<string, string>) => void;
}

const SHOW = 8;

export default function FilterDrawer({ open, onClose, groups, facets, filters, extras, onApply }: Props) {
  const [f, setF] = useState(filters);
  const [e, setE] = useState(extras);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [mini, setMini] = useState<Record<string, string>>({});
  const [all, setAll] = useState<Set<string>>(new Set());

  // при каждом открытии — черновик = применённые значения
  useEffect(() => {
    if (!open) return;
    setF(filters); setE(extras); setMini({}); setAll(new Set());
    setOpenGroups(new Set(groups.filter((g) => g.kind === "check" && filters[g.key]?.length).map((g) => (g as { key: string }).key)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  const toggleValue = (k: string, v: string) =>
    setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));
  const toggleGroup = (k: string) =>
    setOpenGroups((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const draftCount = useMemo(
    () => Object.values(f).filter((v) => v.length).length + Object.values(e).filter(Boolean).length, [f, e]);

  if (!open) return null;

  return (
    <>
      <div className="fd-backdrop" onClick={onClose} />
      <aside className="fd-panel" role="dialog" aria-label="Фильтр">
        <header className="fd-head">
          <h5 className="mb-0"><i className="bi bi-funnel me-2" />Фильтр{draftCount > 0 && <span className="badge bg-primary ms-2">{draftCount}</span>}</h5>
          <button type="button" className="btn-close" aria-label="Закрыть" onClick={onClose} />
        </header>

        <div className="fd-body">
          {groups.map((g) => {
            if (g.kind === "switch")
              return (
                <div className="fd-group px-3 py-3" key={g.key}>
                  <div className="form-check form-switch">
                    <input className="form-check-input" type="checkbox" id={`sw-${g.key}`} checked={e[g.key] === "1"}
                      onChange={(ev) => setE((p) => ({ ...p, [g.key]: ev.target.checked ? "1" : "" }))} />
                    <label className="form-check-label" htmlFor={`sw-${g.key}`}>{g.text}</label>
                  </div>
                </div>
              );

            if (g.kind === "daterange")
              return (
                <div className="fd-group px-3 py-3" key={g.fromKey}>
                  <div className="fw-semibold mb-2">{g.label}</div>
                  <div className="d-flex gap-2 align-items-center">
                    <input type="date" className="form-control form-control-sm" value={e[g.fromKey] ?? ""} max={e[g.toKey] || undefined}
                      onChange={(ev) => setE((p) => ({ ...p, [g.fromKey]: ev.target.value }))} />
                    <span className="text-muted">—</span>
                    <input type="date" className="form-control form-control-sm" value={e[g.toKey] ?? ""} min={e[g.fromKey] || undefined}
                      onChange={(ev) => setE((p) => ({ ...p, [g.toKey]: ev.target.value }))} />
                  </div>
                </div>
              );

            // группа чекбоксов; выбранные значения всегда видны, даже если счётчик стал 0
            const items = [...(facets[g.key] ?? [])];
            for (const v of f[g.key] ?? []) if (!items.some((i) => i.value === v)) items.push({ value: v, label: v, count: 0 });
            const selected = f[g.key]?.length ?? 0;
            const isOpen = openGroups.has(g.key);
            const term = (mini[g.key] ?? "").toLowerCase();
            const shown = items.filter((i) => i.label.toLowerCase().includes(term));
            const visible = all.has(g.key) || term ? shown : shown.slice(0, SHOW);
            return (
              <div className="fd-group" key={g.key}>
                <button type="button" className="fd-toggle" onClick={() => toggleGroup(g.key)} aria-expanded={isOpen}>
                  <span>{g.label}{selected > 0 && <span className="badge bg-primary ms-2">{selected}</span>}</span>
                  <i className={`bi ${isOpen ? "bi-chevron-up" : "bi-chevron-down"}`} />
                </button>
                {isOpen && (
                  <div className="px-3 pb-3">
                    {g.searchable !== false && items.length > SHOW && (
                      <input className="form-control form-control-sm mb-2" placeholder="Найти в списке…" value={mini[g.key] ?? ""}
                        onChange={(ev) => setMini((p) => ({ ...p, [g.key]: ev.target.value }))} />
                    )}
                    {items.length === 0 && <div className="text-muted small">Нет значений</div>}
                    {visible.map((i) => (
                      <label className="form-check d-flex align-items-center gap-2 py-1 mb-0" key={i.value}>
                        <input className="form-check-input mt-0" type="checkbox" checked={f[g.key]?.includes(i.value) ?? false}
                          onChange={() => toggleValue(g.key, i.value)} />
                        <span className="flex-grow-1">{i.label}</span>
                        <span className="text-muted small">{i.count}</span>
                      </label>
                    ))}
                    {!term && shown.length > SHOW && (
                      <button type="button" className="btn btn-link btn-sm px-0" onClick={() =>
                        setAll((p) => { const n = new Set(p); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}>
                        {all.has(g.key) ? "Свернуть" : `Показать все (${shown.length})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <footer className="fd-foot">
          <button type="button" className="btn btn-outline-secondary" onClick={() => {
            setF(Object.fromEntries(Object.keys(f).map((k) => [k, []]))); setE(Object.fromEntries(Object.keys(e).map((k) => [k, ""])));
            onApply(Object.fromEntries(Object.keys(f).map((k) => [k, []])), Object.fromEntries(Object.keys(e).map((k) => [k, ""]))); onClose();
          }}>Сбросить всё</button>
          <button type="button" className="btn btn-primary flex-grow-1" onClick={() => { onApply(f, e); onClose(); }}>Применить</button>
        </footer>
      </aside>
    </>
  );
}
