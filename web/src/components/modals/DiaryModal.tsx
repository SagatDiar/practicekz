import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, post, put } from "../../api/client";
import type { Application } from "../../api/models";
import { useAuth } from "../../auth/AuthContext";
import ProgressBar from "../common/ProgressBar";
import { StatusBadge, fmtDate } from "../common/Status";
import Modal from "../Modal";
import { useToast } from "../Toast";
import { useRefreshData } from "../../hooks/useReference";

const RUNNING = ["ACTIVE", "FINISH_REQUESTED", "COMPLETED"];
const today = () => new Date().toISOString().slice(0, 10);

/** Студент пишет дневник и отчёт; компания и университет только читают. */
export default function DiaryModal({ applicationId, onClose }: { applicationId: string; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefreshData();
  const isStudent = user?.role === "STUDENT";
  const { data: a, isPending, error } = useQuery({
    queryKey: ["application", applicationId],
    queryFn: () => api<{ application: Application }>(`/applications/${applicationId}`).then((r) => r.application),
  });
  const [text, setText] = useState("");
  const [date, setDate] = useState(today());
  const [report, setReport] = useState("");
  useEffect(() => { if (a) setReport(a.reportText ?? ""); }, [a?.reportText]); // eslint-disable-line react-hooks/exhaustive-deps

  const opts = (fn: () => Promise<unknown>, okMsg: string, after?: () => void) => ({
    mutationFn: fn,
    onSuccess: async () => { toast.ok(okMsg); after?.(); await refresh(); },
    onError: (e: unknown) => toast.err((e as Error).message),
  });
  const addEntry = useMutation(opts(() => post(`/applications/${applicationId}/diary`, { text, date }), "Запись добавлена", () => setText("")));
  const saveReport = useMutation(opts(() => put(`/applications/${applicationId}/report`, { text: report }), "Отчёт сохранён"));
  const finish = useMutation(opts(() => post(`/applications/${applicationId}/request-finish`), "Отправлено на подтверждение компании"));

  const canWrite = isStudent && a && RUNNING.includes(a.status);

  return (
    <Modal size="xl" title={a ? `Дневник: ${a.practice.title}` : "Дневник практики"} onClose={onClose}>
      {isPending ? <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
        : error ? <div className="alert alert-danger">{(error as Error).message}</div>
        : (
          <>
            <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
              <StatusBadge status={a.status} label={a.statusLabel} />
              <span className="text-muted">{a.company.name}</span>
              {!isStudent && a.student && <span className="text-muted">· {a.student.lastName} {a.student.firstName}</span>}
            </div>
            {a.progress && <div className="mb-4"><ProgressBar p={a.progress} /></div>}
            <div className="row g-4">
              <div className="col-lg-7">
                <h6>Записи ({a.diary?.length ?? 0})</h6>
                {canWrite && (
                  <div className="border rounded-3 p-3 mb-3 bg-light">
                    <div className="row g-2">
                      <div className="col-sm-4"><input type="date" className="form-control" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></div>
                      <div className="col-sm-8"><textarea className="form-control" rows={2} placeholder="Что вы делали сегодня?" value={text} onChange={(e) => setText(e.target.value)} /></div>
                    </div>
                    <button className="btn btn-primary btn-sm mt-2" disabled={text.trim().length < 3 || addEntry.isPending} onClick={() => addEntry.mutate()}>Добавить запись</button>
                  </div>
                )}
                {!a.diary?.length ? <div className="text-muted">Записей пока нет</div> : (
                  <ul className="list-group">
                    {a.diary.map((d) => (
                      <li className="list-group-item" key={d.id}><div className="small text-muted">{fmtDate(d.date)}</div><div style={{ whiteSpace: "pre-wrap" }}>{d.text}</div></li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="col-lg-5">
                <h6>Итоговый отчёт</h6>
                {canWrite ? (
                  <>
                    <textarea className="form-control" rows={8} value={report} onChange={(e) => setReport(e.target.value)} placeholder="Опишите результаты практики" />
                    <button className="btn btn-success btn-sm mt-2" disabled={report.trim().length < 10 || saveReport.isPending} onClick={() => saveReport.mutate()}>Сохранить отчёт</button>
                  </>
                ) : a.reportText ? (
                  <div className="border rounded-3 p-3 bg-light" style={{ whiteSpace: "pre-wrap" }}>{a.reportText}<div className="small text-muted mt-2">Сдан: {fmtDate(a.reportDate)}</div></div>
                ) : <div className="text-muted">Отчёт ещё не сдан</div>}
                {isStudent && a.status === "ACTIVE" && (
                  <button className="btn btn-outline-primary mt-4 w-100" disabled={finish.isPending}
                    onClick={() => window.confirm("Отметить практику как оконченную?") && finish.mutate()}>Практика окончена</button>
                )}
              </div>
            </div>
          </>
        )}
    </Modal>
  );
}
