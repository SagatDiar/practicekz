import { useState } from "react";
import ListShell from "../filters/ListShell";
import SortHeader from "../filters/SortHeader";
import { extraKeys, filterKeys, universityStudentGroups } from "../filters/filterConfigs";
import { StatusBadge } from "../common/Status";
import StudentProfileModal from "../modals/StudentProfileModal";
import { useListQuery } from "../../hooks/useListQuery";

interface Row { id: string; firstName: string; lastName: string; specialty: string; course: number; company: string | null; status: string | null; statusLabel: string }

export default function UniversityStudents() {
  const state = useListQuery<Row>({ endpoint: "/students", filterKeys: filterKeys(universityStudentGroups), extraKeys: extraKeys(universityStudentGroups), defaultSort: "name:asc" });
  const [profileId, setProfileId] = useState<string | null>(null);
  const H = (label: string, field: string) => <SortHeader label={label} field={field} sort={state.sort} onSort={state.setSort} />;
  return (
    <>
      <ListShell state={state} groups={universityStudentGroups} csv placeholder="Поиск по ФИО или специальности…">
        {(items) => (
          <div className="table-responsive bg-white rounded-3 shadow-sm">
            <table className="table table-hover align-middle mb-0">
              <thead><tr>{H("ФИО", "name")}{H("Специальность", "specialty")}{H("Курс", "course")}<th>Компания</th><th>Статус практики</th></tr></thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td><button className="btn btn-link p-0 text-start" onClick={() => setProfileId(s.id)}>{s.lastName} {s.firstName}</button></td>
                    <td>{s.specialty}</td><td>{s.course}</td><td>{s.company ?? "—"}</td>
                    <td>{s.status ? <StatusBadge status={s.status} label={s.statusLabel} /> : <span className="text-muted">Без практики</span>}</td>
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
