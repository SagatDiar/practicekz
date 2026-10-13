import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Application, Practice } from "../api/models";
import { useAuth } from "../auth/AuthContext";
import PageFrame from "../components/PageFrame";
import ApplicationActions from "../components/ApplicationActions";
import ProgressBar from "../components/common/ProgressBar";
import { StatusBadge } from "../components/common/Status";
import PracticeModal from "../components/modals/PracticeModal";
import { PracticeCard } from "./PracticeListPage";

interface Dash {
  role: string; stats: Record<string, number>;
  running?: Application[]; recommended?: Practice[]; latest?: Application[]; needSign?: Application[];
}

const Stat = ({ icon, label, value, to }: { icon: string; label: string; value: number; to?: string }) => {
  const body = (
    <div className="card stat-card h-100"><div className="card-body d-flex align-items-center gap-3">
      <i className={`bi ${icon} fs-2 text-primary`} /><div><div className="num">{value}</div><div className="text-muted small">{label}</div></div>
    </div></div>
  );
  return <div className="col-6 col-xl">{to ? <Link to={to} className="text-decoration-none text-reset">{body}</Link> : body}</div>;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isPending, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dash>("/dashboard") });
  const role = user!.role;
  const greet = user!.student?.firstName ?? user!.company?.companyName ?? user!.university?.shortName;

  let body: ReactNode = null;
  if (data) {
    const s = data.stats;
    if (role === "STUDENT") body = (
      <>
        <div className="row g-3 mb-4">
          <Stat icon="bi-search" label="Подходящих практик" value={s.suitable} to="/student/practices" />
          <Stat icon="bi-file-earmark-text" label="Всего заявок" value={s.total} to="/student/applications" />
          <Stat icon="bi-check-circle" label="Одобрено" value={s.approved} />
          <Stat icon="bi-hourglass-split" label="На рассмотрении" value={s.pending} />
        </div>
        <h5>Моя практика</h5>
        {data.running?.length ? (
          <div className="row g-3 mb-4">{data.running.map((a) => (
            <div className="col-12 col-lg-6" key={a.id}><div className="card border-0 shadow-sm"><div className="card-body">
              <div className="d-flex justify-content-between mb-2"><div><strong>{a.practice.title}</strong><div className="text-muted small">{a.company.name}</div></div><StatusBadge status={a.status} label={a.statusLabel} /></div>
              {a.progress && <div className="my-3"><ProgressBar p={a.progress} /></div>}
              <ApplicationActions a={a} role={role} />
            </div></div></div>
          ))}</div>
        ) : <div className="text-muted mb-4">Активной практики пока нет. Подайте заявку — это займёт минуту.</div>}
        <h5>Рекомендуем</h5>
        <div className="row g-3">{data.recommended?.map((p) => <PracticeCard key={p.id} p={p} isCompany={false} onOpen={() => setOpenId(p.id)} />)}</div>
      </>
    );
    else if (role === "COMPANY") body = (
      <>
        <div className="row g-3 mb-4">
          <Stat icon="bi-briefcase" label="Предложений" value={s.practices} to="/company/practices" />
          <Stat icon="bi-inbox" label="Всего заявок" value={s.total} to="/company/applications" />
          <Stat icon="bi-check-circle" label="Одобрено" value={s.approved} />
          <Stat icon="bi-bell" label="Новые заявки" value={s.fresh} />
        </div>
        <h5>Последние заявки</h5>
        <LatestTable items={data.latest ?? []} role={role} empty="Заявок пока нет" />
      </>
    );
    else body = (
      <>
        <div className="row g-3 mb-4">
          <Stat icon="bi-people" label="Студентов" value={s.students} to="/university/students" />
          <Stat icon="bi-building" label="Компаний" value={s.companies} to="/university/students?tab=companies" />
          <Stat icon="bi-briefcase" label="На практике" value={s.inPractice} />
          <Stat icon="bi-patch-check" label="Завершили" value={s.completed} />
          <Stat icon="bi-pen" label="Ждут вашей подписи" value={s.awaiting} />
        </div>
        <h5>Требуется подпись университета</h5>
        <LatestTable items={data.needSign ?? []} role={role} empty="Нет документов на подпись" />
      </>
    );
  }

  return (
    <PageFrame title="Главная">
      <p className="lead mb-4">Добро пожаловать, {greet}!</p>
      {isPending ? <div className="text-center p-5"><div className="spinner-border text-primary" /></div>
        : error ? <div className="alert alert-danger">{(error as Error).message}</div> : body}
      {openId && <PracticeModal practiceId={openId} onClose={() => setOpenId(null)} />}
    </PageFrame>
  );
}

function LatestTable({ items, role, empty }: { items: Application[]; role: "STUDENT" | "COMPANY" | "UNIVERSITY"; empty: string }) {
  if (!items.length) return <div className="text-muted">{empty}</div>;
  return (
    <div className="table-responsive bg-white rounded-3 shadow-sm">
      <table className="table align-middle mb-0">
        <thead><tr><th>Студент</th><th>Практика</th><th>Статус</th><th>Действия</th></tr></thead>
        <tbody>{items.map((a) => (
          <tr key={a.id}><td>{a.student?.lastName} {a.student?.firstName}</td><td>{a.practice.title}</td>
            <td><StatusBadge status={a.status} label={a.statusLabel} /></td><td><ApplicationActions a={a} role={role} /></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}
