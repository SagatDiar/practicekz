import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Avatar from "./common/Avatar";
import NotificationBell from "./NotificationBell";

type L = [string, string, string]; // путь, подпись, иконка
const links: Record<"STUDENT" | "COMPANY" | "UNIVERSITY", L[]> = {
  STUDENT: [
    ["/student", "Главная", "bi-house"], ["/student/practices", "Найти практику", "bi-search"],
    ["/student/applications", "Мои заявки", "bi-file-earmark-text"], ["/student/diary", "Дневник практики", "bi-journal-text"],
    ["/student/stats", "Моя статистика", "bi-bar-chart"], ["/registry", "Реестры РК", "bi-database"], ["/student/profile", "Мой профиль", "bi-person"],
  ],
  COMPANY: [
    ["/company", "Главная", "bi-house"], ["/company/practices", "Мои предложения", "bi-briefcase"],
    ["/company/new", "Добавить практику", "bi-plus-circle"], ["/company/applications", "Заявки студентов", "bi-inbox"],
    ["/company/stats", "Статистика", "bi-bar-chart"], ["/registry", "Реестры РК", "bi-database"], ["/company/profile", "Профиль", "bi-building"],
  ],
  UNIVERSITY: [
    ["/university", "Главная", "bi-house"], ["/university/students", "Студенты и практика", "bi-people"],
    ["/university/stats", "Статистика", "bi-bar-chart"], ["/registry", "Реестры РК", "bi-database"], ["/university/profile", "Профиль", "bi-mortarboard"],
  ],
};

/** Тёмный sidebar слева + topbar; на мобильных sidebar выезжает поверх. */
export default function PageFrame({ title, children }: { title?: string; children: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const name = user.student ? `${user.student.firstName} ${user.student.lastName}` : user.company?.companyName ?? user.university?.shortName ?? user.email;

  return (
    <div className="app-shell">
      {open && <div className="sb-backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sb-brand">PracticeKZ</div>
        <nav className="flex-grow-1">
          {links[user.role].map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to.split("/").length === 2} className="sb-link" onClick={() => setOpen(false)}>
              <i className={`bi ${icon}`} />{label}
            </NavLink>
          ))}
        </nav>
        <button className="sb-link border-0 bg-transparent w-100 text-start" onClick={logout}><i className="bi bi-box-arrow-right" />Выйти</button>
      </aside>
      <div className="content-col">
        <header className="topbar d-flex align-items-center gap-3 px-3 px-md-4 py-2">
          <button className="btn btn-light d-lg-none" aria-label="Меню" onClick={() => setOpen(true)}><i className="bi bi-list fs-5" /></button>
          <h5 className="mb-0 me-auto">{title}</h5>
          <NotificationBell />
          <span className="d-none d-sm-inline text-muted small">{name}</span>
          <Avatar fileId={user.photoFileId} name={name} size={36} />
        </header>
        <main className="p-3 p-md-4">{children}</main>
      </div>
    </div>
  );
}
