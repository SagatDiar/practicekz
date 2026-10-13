import type { Application } from "../../api/models";

const badge: Record<string, string> = {
  PENDING: "secondary", INVITED: "info", REJECTED: "danger", SIGNING: "warning",
  ACTIVE: "primary", FINISH_REQUESTED: "warning", COMPLETED: "success",
};

export const StatusBadge = ({ status, label }: { status: string; label: string }) =>
  <span className={`badge text-bg-${badge[status] ?? "secondary"}`}>{label}</span>;

export function Signatures({ s }: { s: Application["signatures"] }) {
  return (
    <div className="d-flex gap-1">
      {([["student", "Студент"], ["company", "Компания"], ["university", "Университет"]] as const).map(([k, l]) => (
        <span key={k} className={`badge ${s[k].signed ? "text-bg-success" : "text-bg-light border text-muted"}`}
          title={`${l}: ${s[k].signed ? "подписано" : "не подписано"}`}>{s[k].signed ? "✓ " : ""}{l}</span>
      ))}
    </div>
  );
}

export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("ru-RU") : "—");
export const months = (n: number) => `${n} ${n === 1 ? "месяц" : n < 5 ? "месяца" : "месяцев"}`;
