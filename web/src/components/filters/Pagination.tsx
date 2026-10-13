interface Props {
  page: number; pages: number; limit: number; total: number;
  onPage: (p: number) => void; onLimit: (l: number) => void;
}

export default function Pagination({ page, pages, limit, total, onPage, onLimit }: Props) {
  const nums: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
  else if (nums[nums.length - 1] !== "…") nums.push("…");
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
      <div className="text-muted">Найдено: {total}</div>
      <nav><ul className="pagination pagination-sm mb-0">
        <li className={`page-item ${page <= 1 ? "disabled" : ""}`}><button className="page-link" onClick={() => onPage(page - 1)}>‹</button></li>
        {nums.map((n, i) => n === "…"
          ? <li key={`e${i}`} className="page-item disabled"><span className="page-link">…</span></li>
          : <li key={n} className={`page-item ${n === page ? "active" : ""}`}><button className="page-link" onClick={() => onPage(n)}>{n}</button></li>)}
        <li className={`page-item ${page >= pages ? "disabled" : ""}`}><button className="page-link" onClick={() => onPage(page + 1)}>›</button></li>
      </ul></nav>
      <select className="form-select form-select-sm w-auto" value={limit} onChange={(e) => onLimit(Number(e.target.value))} aria-label="На странице">
        {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} на странице</option>)}
      </select>
    </div>
  );
}
