import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { LegalEntityRow, Paged, RegistryUniversity } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import PageFrame from "../components/PageFrame";
import Pagination from "../components/filters/Pagination";
import { useDebounced } from "../hooks/useDebounced";
import { useReference } from "../hooks/useReference";
import { useState } from "react";

interface Summary { universities: number; legalEntities: number; activeLegalEntities: number; verifiedCompanies: number; universitiesOnPlatform: number }
const nf = new Intl.NumberFormat("ru-RU");

function Kpi({ label, value }: { label: string; value: number | undefined }) {
  return <div className="col-6 col-lg"><div className="card h-100"><div className="card-body py-3">
    <div className="text-muted small">{label}</div><div className="fs-4 fw-bold">{value === undefined ? "…" : nf.format(value)}</div>
  </div></div></div>;
}

/** Реестры РК: ВУЗы (открыт всем) и юридические лица (только после входа). Данные — из нашей базы, куда их загружает импорт. */
export default function RegistryPage() {
  const { user, loading } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") === "entities" ? "entities" : "universities";
  const summary = useQuery({ queryKey: ["registry-summary"], queryFn: () => api<Summary>("/registry/summary") });

  const body = (
    <>
      <div className="row g-3 mb-3">
        <Kpi label="ВУЗов в реестре" value={summary.data?.universities} />
        <Kpi label="ВУЗов на платформе" value={summary.data?.universitiesOnPlatform} />
        <Kpi label="Юрлиц в реестре" value={summary.data?.legalEntities} />
        <Kpi label="Из них действующих" value={summary.data?.activeLegalEntities} />
        <Kpi label="Проверенных компаний" value={summary.data?.verifiedCompanies} />
      </div>
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><button className={`nav-link ${tab === "universities" ? "active" : ""}`} onClick={() => setSp({ tab: "universities" })}>ВУЗы РК</button></li>
        <li className="nav-item"><button className={`nav-link ${tab === "entities" ? "active" : ""}`} onClick={() => setSp({ tab: "entities" })}>Юридические лица</button></li>
      </ul>
      {tab === "universities" ? <Universities /> : user
        ? <Entities />
        : <div className="alert alert-info">Реестр юридических лиц доступен после входа. <Link to="/login">Войти</Link></div>}
    </>
  );

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>;
  if (user) return <PageFrame title="Реестры РК">{body}</PageFrame>;
  return (
    <div className="container py-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex align-items-center mb-3"><div className="brand me-auto">PracticeKZ · Реестры РК</div><Link to="/login" className="btn btn-outline-primary btn-sm">Войти</Link></div>
      {body}
    </div>
  );
}

function Toolbar({ q, setQ, children, placeholder }: { q: string; setQ: (v: string) => void; children?: ReactNode; placeholder: string }) {
  return (
    <div className="d-flex flex-wrap gap-2 mb-3">
      <div className="input-group flex-grow-1" style={{ minWidth: 240, flexBasis: 320 }}>
        <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
        <input className="form-control" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      </div>
      {children}
    </div>
  );
}

const Empty = () => <div className="text-center text-muted p-4">Ничего не найдено. Попробуйте изменить запрос.</div>;
const Loading = () => <div className="text-center p-4"><div className="spinner-border text-primary" /></div>;

function Universities() {
  const cities = useReference("cities");
  const [q, setQ] = useState(""); const [city, setCity] = useState(""); const [page, setPage] = useState(1); const [limit, setLimit] = useState(25);
  const dq = useDebounced(q.trim());
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["registry-unis", dq, city, page, limit], placeholderData: (p) => p,
    queryFn: () => api<Paged<RegistryUniversity>>(`/registry/universities?${new URLSearchParams({ q: dq, city, page: String(page), limit: String(limit) })}`),
  });
  return (
    <>
      <Toolbar q={q} setQ={(v) => { setQ(v); setPage(1); }} placeholder="Название или сокращение ВУЗа">
        <select className="form-select w-auto" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} aria-label="Город">
          <option value="">Все города</option>{cities.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Toolbar>
      {isPending ? <Loading /> : isError ? <div className="alert alert-danger">{(error as Error).message}</div> : (
        <div className="card"><div className="table-responsive"><table className="table table-hover mb-0 align-middle">
          <thead><tr><th>Сокр.</th><th>Название</th><th>Город</th><th>На платформе</th></tr></thead>
          <tbody>{data.items.map((u) => (
            <tr key={u.registryId}><td className="fw-semibold">{u.shortName}</td><td>{u.name}</td><td>{u.city}</td>
              <td>{u.onPlatform ? <span className="badge bg-success">Да</span> : <span className="badge bg-secondary">Нет</span>}</td></tr>))}</tbody>
        </table>{data.items.length === 0 && <Empty />}</div></div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} limit={data.limit} total={data.total} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }} />}
    </>
  );
}

function Entities() {
  const cities = useReference("cities");
  const [q, setQ] = useState(""); const [city, setCity] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1); const [limit, setLimit] = useState(25);
  const dq = useDebounced(q.trim());
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["registry-entities", dq, city, status, page, limit], placeholderData: (p) => p,
    queryFn: () => api<Paged<LegalEntityRow>>(`/registry/legal-entities?${new URLSearchParams({ q: dq, city, status, page: String(page), limit: String(limit) })}`),
  });
  return (
    <>
      <Toolbar q={q} setQ={(v) => { setQ(v); setPage(1); }} placeholder="Название организации или начало БИН">
        <select className="form-select w-auto" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} aria-label="Город">
          <option value="">Все города</option>{cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="form-select w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Статус">
          <option value="">Любой статус</option><option value="ACTIVE">Действующие</option><option value="LIQUIDATED">Ликвидированные</option>
        </select>
      </Toolbar>
      {isPending ? <Loading /> : isError ? <div className="alert alert-danger">{(error as Error).message}</div> : (
        <div className="card"><div className="table-responsive"><table className="table table-hover mb-0 align-middle">
          <thead><tr><th>БИН</th><th>Название</th><th>Форма</th><th>Сфера</th><th>Город</th><th>Статус</th><th>На платформе</th></tr></thead>
          <tbody>{data.items.map((e) => (
            <tr key={e.bin}><td className="text-nowrap font-monospace">{e.bin}</td><td>{e.name}</td><td>{e.legalForm ?? "—"}</td><td>{e.industry ?? "—"}</td><td>{e.city ?? "—"}</td>
              <td>{e.status === "ACTIVE" ? <span className="badge bg-success">Действует</span> : <span className="badge bg-danger">Ликвидировано</span>}</td>
              <td>{e.onPlatform ? <span className="badge bg-primary">Да</span> : "—"}</td></tr>))}</tbody>
        </table>{data.items.length === 0 && <Empty />}</div></div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} limit={data.limit} total={data.total} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }} />}
    </>
  );
}
