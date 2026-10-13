import { useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import PageFrame from "../components/PageFrame";
import FilterChips from "../components/filters/FilterChips";
import FilterDrawer from "../components/filters/FilterDrawer";
import DoughnutBlock from "../components/charts/DoughnutBlock";
import HBarChart, { isEmptyBars } from "../components/charts/HBarChart";
import KpiGrid from "../components/charts/KpiGrid";
import { useStatsQuery } from "../hooks/useStatsQuery";
import { statTabs } from "../stats/statsConfig";
import "../components/charts/chartSetup";

const Empty = () => (
  <div className="text-center text-muted p-5">
    <i className="bi bi-bar-chart fs-1 d-block mb-2" />Данных пока нет
  </div>
);

/** Вкладки статистики: в DOM только выбранная, данные грузятся по требованию (/api/stats/{роль}/{метрика}). */
export default function StatsPage() {
  const { user } = useAuth();
  const role = user!.role;
  const s = useStatsQuery(role, statTabs[role]);
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const { data, isPending, isError, error, isFetching } = s.result;

  const savePng = () => {
    const canvas = host.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `stats-${role.toLowerCase()}-${s.tab.key}.png`;
    a.click();
  };

  const hasChart = data?.type === "doughnut" || (data?.type === "bars" && !isEmptyBars(data));
  const isEmpty = data?.type === "doughnut" ? data.segments.length === 0 : data?.type === "bars" ? isEmptyBars(data) : false;

  return (
    <PageFrame title={role === "STUDENT" ? "Моя статистика" : "Статистика"}>
      <div className="stat-tabs" role="tablist" aria-label="Разделы статистики">
        {statTabs[role].map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === s.tab.key}
            className={`stat-tab ${t.key === s.tab.key ? "active" : ""}`} onClick={() => s.setTab(t.key)}>
            <i className={`bi ${t.icon} me-1`} />{t.label}
          </button>
        ))}
      </div>

      <div className="d-flex flex-wrap gap-2 align-items-center my-3">
        <h5 className="mb-0 me-auto">{s.tab.label}</h5>
        <button type="button" className="btn btn-outline-primary" onClick={() => setOpen(true)}>
          <i className="bi bi-funnel me-1" />Фильтр{s.activeCount > 0 && <span className="badge bg-primary ms-2">{s.activeCount}</span>}
        </button>
        <a className="btn btn-outline-success" href={s.csvUrl}><i className="bi bi-filetype-csv me-1" />CSV</a>
        {hasChart && <button type="button" className="btn btn-outline-secondary" onClick={savePng}><i className="bi bi-image me-1" />PNG</button>}
      </div>

      <FilterChips groups={s.tab.groups} facets={s.facets} filters={s.filters} extras={s.extras}
        onRemoveValue={s.removeFilterValue} onRemoveExtra={s.removeExtra} onReset={s.resetAll} />
      <FilterDrawer open={open} onClose={() => setOpen(false)} groups={s.tab.groups} facets={s.facets}
        filters={s.filters} extras={s.extras} onApply={s.apply} />

      <div ref={host} role="tabpanel" className={`chart-block mt-3 ${isFetching && !isPending ? "opacity-75" : ""}`}>
        {isPending ? <div className="text-center p-5"><div className="spinner-border text-primary" /></div>
          : isError ? <div className="alert alert-danger mb-0">{(error as Error).message}</div>
          : !data ? null
          : data.type === "kpi" ? <KpiGrid data={data} />
          : isEmpty ? <Empty />
          : data.type === "doughnut" ? <DoughnutBlock data={data} />
          : <HBarChart data={data} />}
      </div>
    </PageFrame>
  );
}
