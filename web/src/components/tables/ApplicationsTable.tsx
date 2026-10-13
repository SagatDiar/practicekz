import { useState } from "react";
import type { Application } from "../../api/models";
import type { Role } from "../../api/types";
import ApplicationActions from "../ApplicationActions";
import ListShell from "../filters/ListShell";
import SortHeader from "../filters/SortHeader";
import { companyApplicationGroups, extraKeys, filterKeys, studentApplicationGroups, universityPracticeGroups } from "../filters/filterConfigs";
import { Signatures, StatusBadge, fmtDate } from "../common/Status";
import StudentProfileModal from "../modals/StudentProfileModal";
import { useListQuery } from "../../hooks/useListQuery";

/** Одна таблица для трёх ролей: студент («Мои заявки»), компания («Заявки студентов»), университет (вкладка «Практика»). */
export default function ApplicationsTable({ role }: { role: Role }) {
  const groups = role === "STUDENT" ? studentApplicationGroups : role === "COMPANY" ? companyApplicationGroups : universityPracticeGroups;
  const state = useListQuery<Application>({
    endpoint: "/applications", filterKeys: filterKeys(groups), extraKeys: extraKeys(groups), defaultSort: "date:desc",
  });
  const [profileId, setProfileId] = useState<string | null>(null);
  const H = (label: string, field: string) => <SortHeader label={label} field={field} sort={state.sort} onSort={state.setSort} />;

  return (
    <>
      <ListShell state={state} groups={groups} csv placeholder="Поиск по студенту, компании, практике…">
        {(items) => (
          <div className="table-responsive bg-white rounded-3 shadow-sm">
            <table className="table table-hover align-middle mb-0">
              <thead><tr>
                {role !== "STUDENT" && H("Студент", "student")}
                {role !== "COMPANY" && H("Компания", "company")}
                {role !== "STUDENT" && H("Специальность", "specialty")}
                {role === "COMPANY" && <th>Навыки</th>}
                {H("Практика", "practice")}
                {role !== "UNIVERSITY" && H("Дата подачи", "date")}
                {H("Статус", "status")}
                <th>Подписи ЭЦП</th>
                <th>Действия</th>
              </tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    {role !== "STUDENT" && (
                      <td>{a.student && role === "COMPANY"
                        ? <button className="btn btn-link p-0 text-start" onClick={() => setProfileId(a.student!.id)}>{a.student.lastName} {a.student.firstName}</button>
                        : `${a.student?.lastName ?? ""} ${a.student?.firstName ?? ""}`}</td>
                    )}
                    {role !== "COMPANY" && <td>{a.company.name}</td>}
                    {role !== "STUDENT" && <td>{a.student?.specialty}</td>}
                    {role === "COMPANY" && <td className="small text-muted">{a.student?.skills}</td>}
                    <td>{a.practice.title}</td>
                    {role !== "UNIVERSITY" && <td>{fmtDate(a.date)}</td>}
                    <td><StatusBadge status={a.status} label={a.statusLabel} /></td>
                    <td><Signatures s={a.signatures} /></td>
                    <td><ApplicationActions a={a} role={role} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListShell>
      {profileId && <StudentProfileModal studentId={profileId} onClose={() => setProfileId(null)} />}
    </>
  );
}
