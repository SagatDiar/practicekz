import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { post } from "../../api/client";
import type { Application } from "../../api/models";
import { useAuth } from "../../auth/AuthContext";
import Modal from "../Modal";
import { useToast } from "../Toast";
import { useRefreshData } from "../../hooks/useReference";

const who = { STUDENT: "Студент", COMPANY: "Компания", UNIVERSITY: "Университет" } as const;

/** Прототип ЭЦП в стиле eGov: реальной криптографии нет, но кто и когда подписал — сохраняется на сервере. */
export default function SignModal({ app, onClose }: { app: Application; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefreshData();
  const [agree, setAgree] = useState(false);
  const sign = useMutation({
    mutationFn: () => post(`/applications/${app.id}/sign`),
    onSuccess: async () => { toast.ok("Документ подписан ЭЦП"); await refresh(); onClose(); },
    onError: (e) => toast.err((e as Error).message),
  });
  const name = user?.student ? `${user.student.lastName} ${user.student.firstName}` : user?.company?.companyName ?? user?.university?.universityName ?? "";

  return (
    <Modal size="" title={<><i className="bi bi-shield-lock me-2 text-primary" />Подписание ЭЦП</>} onClose={onClose}
      footer={<>
        <button className="btn btn-outline-secondary" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" disabled={!agree || sign.isPending} onClick={() => sign.mutate()}>{sign.isPending ? "Подписание…" : "Подписать ЭЦП"}</button>
      </>}>
      <div className="rounded-3 p-3 mb-3 text-white" style={{ background: "linear-gradient(135deg,#1f4fd8,#2f6bff)" }}>
        <div className="fw-semibold">eGov · Электронная цифровая подпись</div>
        <div className="small opacity-75">Демонстрационный режим</div>
      </div>
      <dl className="row mb-3">
        <dt className="col-4 text-muted fw-normal">Документ</dt><dd className="col-8">Договор о практике «{app.practice.title}»</dd>
        <dt className="col-4 text-muted fw-normal">Стороны</dt><dd className="col-8">{app.student?.lastName} {app.student?.firstName} · {app.company.name} · {app.university.name}</dd>
        <dt className="col-4 text-muted fw-normal">Подписывает</dt><dd className="col-8">{user && who[user.role]}: {name}</dd>
      </dl>
      <div className="form-check">
        <input className="form-check-input" type="checkbox" id="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <label className="form-check-label" htmlFor="agree">Подтверждаю подписание документа своей ЭЦП</label>
      </div>
    </Modal>
  );
}
