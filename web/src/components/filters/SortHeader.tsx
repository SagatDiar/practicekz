/** Заголовок столбца: клик — сортировка, повторный клик — смена направления (▲/▼). */
export default function SortHeader({ label, field, sort, onSort }: { label: string; field: string; sort: string; onSort: (s: string) => void }) {
  const [key, dir] = sort.split(":");
  const active = key === field;
  return (
    <th role="button" className="text-nowrap user-select-none" onClick={() => onSort(`${field}:${active && dir === "asc" ? "desc" : "asc"}`)}>
      {label} {active ? (dir === "asc" ? "▲" : "▼") : <span className="text-muted opacity-50">↕</span>}
    </th>
  );
}
