import { useEffect, useMemo, useState } from "react";
import { Doughnut } from "react-chartjs-2";
import type { ChartOptions, Plugin } from "chart.js";
import type { DoughnutResult } from "../../api/stats";
import { whiteBg } from "./chartSetup";

/** Круговая диаграмма: клик по сегменту (или по строке легенды) выдвигает его и показывает точное число и долю. */
export default function DoughnutBlock({ data }: { data: DoughnutResult }) {
  const segs = data.segments.filter((s) => s.value > 0);
  const [active, setActive] = useState<number | null>(null);
  const signature = segs.map((s) => `${s.key}:${s.value}`).join("|");
  useEffect(() => setActive(null), [signature]);

  const toggle = (i: number) => setActive((p) => (p === i ? null : i));
  const cur = active == null ? null : segs[active];

  const center = useMemo<Plugin<"doughnut">>(() => ({
    id: "centerText",
    beforeDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom } } = chart;
      const x = (left + right) / 2, y = (top + bottom) / 2;
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "#1f2a44";
      ctx.font = "700 30px system-ui, sans-serif";
      ctx.fillText(String(data.total), x, y + 4);
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "#6b7490";
      ctx.fillText(data.unit, x, y + 24);
      ctx.restore();
    },
  }), [data.total, data.unit]);

  const options: ChartOptions<"doughnut"> = {
    cutout: "62%",
    maintainAspectRatio: false,
    layout: { padding: 20 },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    onClick: (_e, els) => { if (els.length) toggle(els[0].index); },
    onHover: (e, els) => { const t = e.native?.target as HTMLElement | undefined; if (t) t.style.cursor = els.length ? "pointer" : "default"; },
  };

  return (
    <div className="row g-4 align-items-center justify-content-center">
      <div className="col-12 col-md-6 col-lg-5">
        <div style={{ height: 320 }}>
          <Doughnut
            plugins={[whiteBg, center]}
            options={options}
            data={{
              labels: segs.map((s) => s.label),
              datasets: [{
                data: segs.map((s) => s.value),
                backgroundColor: segs.map((s) => s.color),
                borderColor: "#fff", borderWidth: 2,
                offset: segs.map((_, i) => (i === active ? 18 : 0)),
              }],
            }}
          />
        </div>
      </div>
      <div className="col-12 col-md-6 col-lg-5">
        <ul className="list-unstyled mb-3">
          {segs.map((s, i) => (
            <li key={s.key}>
              <button type="button" className={`legend-row ${i === active ? "active" : ""}`} onClick={() => toggle(i)} aria-pressed={i === active}>
                <span className="legend-dot" style={{ background: s.color }} />
                <span className="flex-grow-1 text-start">{s.label}</span>
                <strong>{s.value}</strong>
              </button>
            </li>
          ))}
        </ul>
        <div className="doughnut-caption" aria-live="polite">
          {cur
            ? <><strong>{cur.value}</strong> из {data.total} {data.unit} (<strong>{Math.round((cur.value / data.total) * 100)}%</strong>) — {cur.label}</>
            : <span className="text-muted">Нажмите на сегмент диаграммы, чтобы увидеть точное число и долю</span>}
        </div>
      </div>
    </div>
  );
}
