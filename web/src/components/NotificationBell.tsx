import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, patch, post } from "../api/client";
import type { Notice, NoticePage } from "../api/notifications";
import { useAuth } from "../auth/AuthContext";

const target = { STUDENT: "/student/applications", COMPANY: "/company/applications", UNIVERSITY: "/university/students?tab=practice" } as const;
const icon: Record<string, string> = {
  APPLICATION_NEW: "bi-file-earmark-plus", APPLICATION_INVITE: "bi-calendar-check", APPLICATION_APPROVE: "bi-check-circle text-success",
  APPLICATION_REJECT: "bi-x-circle text-danger", SIGNED: "bi-pen", PRACTICE_STARTED: "bi-play-circle text-primary",
  FINISH_REQUESTED: "bi-flag", COMPLETED: "bi-patch-check text-success", DIARY_ADDED: "bi-journal-plus", REPORT_SUBMITTED: "bi-file-earmark-text",
};

const ago = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "только что";
  if (s < 3600) return `${Math.floor(s / 60)} мин. назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч. назад`;
  return new Date(iso).toLocaleDateString("ru-RU");
};

export default function NotificationBell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api<NoticePage>("/notifications?limit=20"),
    refetchInterval: 120_000, // запасной вариант, если сокет недоступен
  });
  const markOne = useMutation({
    mutationFn: (id: string) => patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", click);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", click); window.removeEventListener("keydown", esc); };
  }, [open]);

  const unread = data?.unread ?? 0;
  const go = (n: Notice) => {
    if (!n.read) markOne.mutate(n.id);
    setOpen(false);
    if (n.applicationId && user) nav(target[user.role]);
  };

  return (
    <div className="position-relative" ref={box}>
      <button className="btn btn-light position-relative" aria-label="Уведомления" onClick={() => setOpen(!open)}>
        <i className="bi bi-bell fs-5" />
        {unread > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="notice-panel shadow">
          <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
            <strong>Уведомления</strong>
            <button className="btn btn-link btn-sm p-0" disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()}>Прочитать все</button>
          </div>
          <div className="notice-list">
            {!data?.items.length ? <div className="text-center text-muted p-4"><i className="bi bi-bell-slash fs-2 d-block mb-1" />Уведомлений пока нет</div>
              : data.items.map((n) => (
                <button key={n.id} className={`notice-item ${n.read ? "" : "unread"}`} onClick={() => go(n)}>
                  <i className={`bi ${icon[n.type] ?? "bi-info-circle"} fs-5`} />
                  <span className="flex-grow-1 text-start">{n.text}<span className="d-block small text-muted">{ago(n.createdAt)}</span></span>
                  {!n.read && <span className="dot" />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
