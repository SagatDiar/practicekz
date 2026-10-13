import type { Facets } from "../../api/list";
import type { GroupDef } from "./FilterDrawer";

interface Props {
  groups: GroupDef[];
  facets: Facets;
  filters: Record<string, string[]>;
  extras: Record<string, string>;
  onRemoveValue: (key: string, value: string) => void;
  onRemoveExtra: (...keys: string[]) => void;
  onReset: () => void;
}

export default function FilterChips({ groups, facets, filters, extras, onRemoveValue, onRemoveExtra, onReset }: Props) {
  const chips: { id: string; text: string; remove: () => void }[] = [];
  for (const g of groups) {
    if (g.kind === "check")
      for (const v of filters[g.key] ?? []) {
        const label = facets[g.key]?.find((f) => f.value === v)?.label ?? v;
        chips.push({ id: `${g.key}:${v}`, text: `${g.label}: ${label}`, remove: () => onRemoveValue(g.key, v) });
      }
    else if (g.kind === "switch" && extras[g.key] === "1")
      chips.push({ id: g.key, text: g.text, remove: () => onRemoveExtra(g.key) });
    else if (g.kind === "daterange" && (extras[g.fromKey] || extras[g.toKey]))
      chips.push({ id: g.fromKey, text: `${g.label}: ${extras[g.fromKey] || "…"} — ${extras[g.toKey] || "…"}`, remove: () => onRemoveExtra(g.fromKey, g.toKey) });
  }
  if (!chips.length) return null;
  return (
    <div className="d-flex flex-wrap gap-2 align-items-center mt-2">
      {chips.map((c) => (
        <span key={c.id} className="badge rounded-pill text-bg-light border fw-normal fs-6 d-flex align-items-center gap-2">
          {c.text}
          <button type="button" className="btn-close" style={{ fontSize: ".6rem" }} aria-label="Убрать" onClick={c.remove} />
        </span>
      ))}
      <button type="button" className="btn btn-link btn-sm" onClick={onReset}>Сбросить всё</button>
    </div>
  );
}
