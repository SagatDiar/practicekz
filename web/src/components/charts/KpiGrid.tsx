import type { KpiResult } from "../../api/stats";

export default function KpiGrid({ data }: { data: KpiResult }) {
  return (
    <>
      <div className="row g-3">
        {data.items.map((k) => (
          <div className="col-6 col-lg-4 col-xl-3" key={k.key}>
            <div className="card stat-card h-100"><div className="card-body d-flex align-items-center gap-3">
              <i className={`bi ${k.icon} fs-2 text-primary`} />
              <div>
                <div className="num">{k.value == null ? "—" : `${k.value}${k.suffix ?? ""}`}</div>
                <div className="text-muted small">{k.label}</div>
              </div>
            </div></div>
          </div>
        ))}
      </div>
      {data.progress && (
        <div className="card stat-card mt-3"><div className="card-body">
          <div className="d-flex justify-content-between mb-2"><span>{data.progress.label}</span><strong>{data.progress.percent}%</strong></div>
          <div className="progress" role="progressbar" aria-valuenow={data.progress.percent} aria-valuemin={0} aria-valuemax={100} style={{ height: 12 }}>
            <div className="progress-bar bg-success" style={{ width: `${data.progress.percent}%` }} />
          </div>
        </div></div>
      )}
    </>
  );
}
