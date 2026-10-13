import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Application } from "../api/models";
import type { Paged } from "../api/list";
import PageFrame from "../components/PageFrame";
import ProgressBar from "../components/common/ProgressBar";
import { StatusBadge, fmtDate } from "../components/common/Status";
import DiaryModal from "../components/modals/DiaryModal";

export default function DiaryPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: ["/applications", "diary"],
    queryFn: () => api<Paged<Application>>("/applications?status=ACTIVE&status=FINISH_REQUESTED&status=COMPLETED&limit=100&sort=date:desc"),
  });
  return (
    <PageFrame title="Дневник практики">
      {isPending ? <div className="text-center p-5"><div className="spinner-border text-primary" /></div>
        : error ? <div className="alert alert-danger">{(error as Error).message}</div>
        : data.items.length === 0 ? (
          <div className="text-center text-muted p-5 bg-white rounded-3 border"><i className="bi bi-journal-text fs-1 d-block mb-2" />Практика ещё не началась. Дневник появится после подписания договора тремя сторонами.</div>
        ) : (
          <div className="row g-3">
            {data.items.map((a) => (
              <div className="col-12 col-lg-6" key={a.id}><div className="card border-0 shadow-sm h-100"><div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-2"><div><h5 className="mb-0">{a.practice.title}</h5><div className="text-muted">{a.company.name}</div></div><StatusBadge status={a.status} label={a.statusLabel} /></div>
                {a.progress && <div className="my-3"><ProgressBar p={a.progress} /></div>}
                <div className="small text-muted mb-3">Старт: {fmtDate(a.startDate)} · Записей: {a.diaryCount}{a.reportDate ? ` · Отчёт сдан ${fmtDate(a.reportDate)}` : ""}</div>
                <button className="btn btn-primary btn-sm" onClick={() => setOpenId(a.id)}>Открыть дневник</button>
              </div></div></div>
            ))}
          </div>
        )}
      {openId && <DiaryModal applicationId={openId} onClose={() => setOpenId(null)} />}
    </PageFrame>
  );
}
