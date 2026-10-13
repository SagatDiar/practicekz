import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { post } from "../api/client";
import type { Application } from "../api/models";
import type { Role } from "../api/types";
import DiaryModal from "./modals/DiaryModal";
import PracticeModal from "./modals/PracticeModal";
import SignModal from "./modals/SignModal";
import { useToast } from "./Toast";
import { useRefreshData } from "../hooks/useReference";

const RUNNING = ["ACTIVE", "FINISH_REQUESTED", "COMPLETED"];

/** Кнопки действий по статусу заявки и роли. Сервер всё равно перепроверяет права и статус. */
export default function ApplicationActions({ a, role }: { a: Application; role: Role }) {
  const toast = useToast();
  const refresh = useRefreshData();
  const [modal, setModal] = useState<"sign" | "diary" | "details" | null>(null);
  const act = useMutation({
    mutationFn: ({ path }: { path: string; ok: string }) => post(`/applications/${a.id}/${path}`),
    onSuccess: async (_d, v) => { toast.ok(v.ok); await refresh(); },
    onError: (e) => toast.err((e as Error).message),
  });
  const run = (path: string, ok: string, confirm?: string) => () => { if (!confirm || window.confirm(confirm)) act.mutate({ path, ok }); };
  const busy = act.isPending;

  const B = (label: string, onClick: () => void, cls = "outline-primary") =>
    <button key={label} className={`btn btn-sm btn-${cls} me-1 mb-1`} disabled={busy} onClick={onClick}>{label}</button>;
  const wait = (t: string) => <span key={t} className="text-muted small me-2">{t}</span>;
  const sign = B("Подписать ЭЦП", () => setModal("sign"), "primary");
  const diary = (label = "Дневник") => B(label, () => setModal("diary"));
  const details = B("Детали", () => setModal("details"), "outline-secondary");
  const reject = B("Отклонить", run("reject", "Заявка отклонена", "Отклонить заявку?"), "outline-danger");
  const approve = B("Одобрить", run("approve", "Заявка одобрена — ждём подписи"), "success");

  let buttons: ReactNode[] = [details];
  const s = a.status;
  if (role === "STUDENT") {
    if (s === "SIGNING") buttons = [a.signatures.student.signed ? wait("Ждём подписи остальных") : sign];
    else if (s === "ACTIVE") buttons = [diary(), B("Практика окончена", run("request-finish", "Отправлено на подтверждение компании", "Отметить практику как оконченную?"))];
    else if (s === "FINISH_REQUESTED") buttons = [wait("Ждём подтверждения компании"), diary()];
    else if (s === "COMPLETED") buttons = [diary("Дневник и отчёт")];
  } else if (role === "COMPANY") {
    if (s === "PENDING") buttons = [B("Пригласить", run("invite", "Студент приглашён")), approve, reject];
    else if (s === "INVITED") buttons = [approve, reject];
    else if (s === "SIGNING") buttons = [a.signatures.company.signed ? wait("Ждём подписи остальных") : sign];
    else if (s === "ACTIVE") buttons = [diary()];
    else if (s === "FINISH_REQUESTED") buttons = [B("Подтвердить завершение", run("confirm-finish", "Практика завершена", "Подтвердить завершение практики?"), "success"), diary()];
    else if (s === "COMPLETED") buttons = [diary("Дневник и отчёт")];
  } else {
    if (s === "SIGNING") buttons = [a.signatures.university.signed ? wait("Вы подписали") : sign];
    else if (RUNNING.includes(s)) buttons = [diary(s === "COMPLETED" ? "Дневник и отчёт" : "Дневник")];
  }

  return (
    <div className="text-nowrap">
      {buttons}
      {modal === "sign" && <SignModal app={a} onClose={() => setModal(null)} />}
      {modal === "diary" && <DiaryModal applicationId={a.id} onClose={() => setModal(null)} />}
      {modal === "details" && <PracticeModal practiceId={a.practice.id} readOnly onClose={() => setModal(null)} />}
    </div>
  );
}
