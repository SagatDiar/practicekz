import { useMutation, useQuery } from "@tanstack/react-query";
import { api, post } from "../../api/client";
import type { Application, Practice } from "../../api/models";
import { useAuth } from "../../auth/AuthContext";
import { fmtDate, months } from "../common/Status";
import Modal from "../Modal";
import { useToast } from "../Toast";
import { useRefreshData } from "../../hooks/useReference";

interface Props { practiceId: string; readOnly?: boolean; onClose: () => void }

export default function PracticeModal({ practiceId, readOnly, onClose }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefreshData();
  const { data, isPending, error } = useQuery({
    queryKey: ["/practices", "one", practiceId],
    queryFn: () => api<{ practice: Practice }>(`/practices/${practiceId}`).then((r) => r.practice),
  });
  const apply = useMutation({
    mutationFn: () => post<{ application: Application }>("/applications", { practiceId }),
    onSuccess: async () => { toast.ok("Заявка подана"); await refresh(); onClose(); },
    onError: (e) => toast.err((e as Error).message),
  });
  const canApply = user?.role === "STUDENT" && !readOnly;

  return (
    <Modal title={data?.title ?? "Практика"} onClose={onClose}
      footer={<>
        <button className="btn btn-outline-secondary" onClick={onClose}>Закрыть</button>
        {canApply && data && (data.applied
          ? <button className="btn btn-success" disabled>Заявка уже подана</button>
          : <button className="btn btn-primary" disabled={apply.isPending} onClick={() => apply.mutate()}>{apply.isPending ? "Отправка…" : "Подать заявку"}</button>)}
      </>}>
      {isPending ? <div className="text-center p-4"><div className="spinner-border text-primary" /></div>
        : error ? <div className="alert alert-danger">{(error as Error).message}</div>
        : (
          <>
            <div className="d-flex flex-wrap gap-2 mb-3">
              <span className="badge text-bg-primary">{data.format}</span>
              <span className="badge text-bg-light border">{data.company.name}</span>
              <span className="badge text-bg-light border"><i className="bi bi-geo-alt me-1" />{data.city}</span>
              <span className="badge text-bg-light border">{data.direction}</span>
              <span className="badge text-bg-light border">{months(data.durationMonths)}</span>
            </div>
            <h6>Описание</h6><p style={{ whiteSpace: "pre-wrap" }}>{data.description}</p>
            <h6>Требования</h6><p style={{ whiteSpace: "pre-wrap" }}>{data.requirements}</p>
            <div className="text-muted small">Мест: {data.places} · Опубликовано: {fmtDate(data.datePublished)}</div>
          </>
        )}
    </Modal>
  );
}
