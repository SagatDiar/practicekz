import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { StudentFull } from "../../api/models";
import Avatar from "../common/Avatar";
import { fmtDate } from "../common/Status";
import Modal from "../Modal";

export default function StudentProfileModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const { data: s, isPending, error } = useQuery({
    queryKey: ["students", "one", studentId],
    queryFn: () => api<{ student: StudentFull }>(`/students/${studentId}`).then((r) => r.student),
  });
  return (
    <Modal title="Профиль студента" onClose={onClose}>
      {isPending ? <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
        : error ? <div className="alert alert-danger">{(error as Error).message}</div>
        : (
          <>
            <div className="d-flex gap-3 align-items-center mb-3">
              <Avatar fileId={s.photoFileId} name={`${s.firstName} ${s.lastName}`} size={72} />
              <div><h5 className="mb-0">{s.lastName} {s.firstName}</h5><div className="text-muted">{s.email}</div></div>
            </div>
            <div className="mb-3">
              {([["Университет", s.university], ["Факультет", s.faculty], ["Специальность", s.specialty], ["Курс", s.course], ["Город", s.city], ["Навыки", s.skills || "—"]] as const).map(([k, v]) => (
                <div className="row mb-1" key={k}><div className="col-4 text-muted">{k}</div><div className="col-8">{v}</div></div>
              ))}
            </div>
            <h6>Сертификаты и достижения</h6>
            {s.extra.length === 0 ? <div className="text-muted">Ничего не добавлено</div> : (
              <ul className="list-group">
                {s.extra.map((e) => (
                  <li className="list-group-item d-flex justify-content-between align-items-center gap-2" key={e.id}>
                    <div><span className={`badge me-2 ${e.type === "CERTIFICATE" ? "text-bg-primary" : "text-bg-warning"}`}>{e.type === "CERTIFICATE" ? "Сертификат" : "Достижение"}</span>
                      <strong>{e.title}</strong><div className="small text-muted">{e.organization} · {fmtDate(e.date)}</div></div>
                    {e.file && <a className="btn btn-outline-secondary btn-sm text-nowrap" href={`/api/files/${e.file.id}?download=1`}><i className="bi bi-download me-1" />Файл</a>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
    </Modal>
  );
}
