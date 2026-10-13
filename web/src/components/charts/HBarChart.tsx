import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import type { BarElement, ChartOptions, Plugin } from "chart.js";
import type { BarsResult } from "../../api/stats";
import { short, whiteBg } from "./chartSetup";

export const isEmptyBars = (d: BarsResult) => d.rows.length === 0 || d.rows.every((r) => r.value === 0);

/** Горизонтальная линейчатая диаграмма (indexAxis: "y"); высота = строки × 40 + 70 px. */
export default function HBarChart({ data }: { data: BarsResult }) {
  const { rows, suffix, unit } = data;

  const valueLabels = useMemo<Plugin<"bar">>(() => ({
    id: "valueLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = "#1f2a44";
      ctx.textBaseline = "middle";
      (chart.getDatasetMeta(0).data as unknown as BarElement[]).forEach((bar, i) => {
        ctx.fillText(`${rows[i].value}${suffix}`, bar.x + 6, bar.y);
      });
      ctx.restore();
    },
  }), [rows, suffix]);

  const options: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { right: 52 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => rows[items[0].dataIndex]?.label ?? "",
          label: (c) => `${c.parsed.x}${suffix} ${unit}`.trim(),
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        max: suffix === "%" ? 100 : undefined,
        ticks: { precision: 0, callback: (v) => `${v}${suffix}` },
        grid: { color: "#eef0f6" },
      },
      y: { grid: { display: false }, ticks: { callback: (_v, i) => short(rows[i]?.label ?? "") } },
    },
  };

  return (
    <div style={{ height: rows.length * 40 + 70 }}>
      <Bar
        plugins={[whiteBg, valueLabels]}
        options={options}
        data={{
          labels: rows.map((r) => r.label),
          datasets: [{ data: rows.map((r) => r.value), backgroundColor: rows.map((r) => r.color ?? "#2f6bff"), borderRadius: 6, barThickness: 22 }],
        }}
      />
    </div>
  );
}
