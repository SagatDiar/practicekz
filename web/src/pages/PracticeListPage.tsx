import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import PageFrame from "../components/PageFrame";
import ListShell from "../components/filters/ListShell";
import { companyPracticeGroups, extraKeys, filterKeys, studentPracticeGroups } from "../components/filters/filterConfigs";
import PracticeModal from "../components/modals/PracticeModal";
import { months } from "../components/common/Status";
import { useListQuery } from "../hooks/useListQuery";
import type { Practice } from "../api/models";

const fmtColor: Record<string, string> = { "Офис": "primary", "Удалённо": "success", "Гибридный": "warning" };

export function PracticeCard({ p, isCompany, onOpen }: { p: Practice; isCompany: boolean; onOpen: () => void }) {
  return (
    <div className="col-12 col-md-6 col-xl-4">
      <div className="card h-100 border-0 shadow-sm"><div className="card-body d-flex flex-column">
        <span className={`badge text-bg-${fmtColor[p.format] ?? "secondary"} align-self-start mb-2`}>{p.format}</span>
        <h5 className="card-title">{p.title}</h5>
        <div className="text-muted mb-2">{p.company.name}</div>
        <ul className="list-unstyled small mb-3">
          <li><i className="bi bi-geo-alt me-2" />{p.city}</li>
          <li><i className="bi bi-tag me-2" />{p.direction}</li>
          <li><i className="bi bi-clock me-2" />{months(p.durationMonths)}</li>
          <li><i className="bi bi-people me-2" />Мест: {p.places}</li>
          {isCompany && <li><i className="bi bi-inbox me-2" />Заявок: {p.applicationsCount}</li>}
          {p.applied && <li className="text-success mt-1"><i className="bi bi-check-circle me-2" />Заявка уже подана</li>}
        </ul>
        <button className="btn btn-outline-primary btn-sm mt-auto align-self-start" onClick={onOpen}>Подробнее</button>
      </div></div>
    </div>
  );
}

/** Студент: «Найти практику». Компания: «Мои предложения» (только свои). */
export default function PracticeListPage() {
  const { user } = useAuth();
  const isCompany = user?.role === "COMPANY";
  const groups = isCompany ? companyPracticeGroups : studentPracticeGroups;
  const state = useListQuery<Practice>({ endpoint: "/practices", filterKeys: filterKeys(groups), extraKeys: extraKeys(groups), defaultSort: "date:desc" });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <PageFrame title={isCompany ? "Мои предложения" : "Найти практику"}>
      <ListShell state={state} groups={groups} placeholder="Поиск по названию, направлению, компании…"
        toolbarExtra={
          <select className="form-select w-auto" value={state.sort} onChange={(e) => state.setSort(e.target.value)} aria-label="Сортировка">
            <option value="date:desc">Сначала новые</option>
            <option value="title:asc">По названию А–Я</option>
            {!isCompany && <option value="company:asc">По компании А–Я</option>}
            <option value="places:desc">Больше мест</option>
          </select>
        }>
        {(items) => (
          <div className="row g-3">
            {items.map((p) => <PracticeCard key={p.id} p={p} isCompany={!!isCompany} onOpen={() => setOpenId(p.id)} />)}
          </div>
        )}
      </ListShell>
      {openId && <PracticeModal practiceId={openId} readOnly={isCompany} onClose={() => setOpenId(null)} />}
    </PageFrame>
  );
}
