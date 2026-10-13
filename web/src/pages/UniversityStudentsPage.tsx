import { useSearchParams } from "react-router-dom";
import PageFrame from "../components/PageFrame";
import ApplicationsTable from "../components/tables/ApplicationsTable";
import UniversityCompanies from "../components/tables/UniversityCompanies";
import UniversityStudents from "../components/tables/UniversityStudents";

const tabs = [["students", "Студенты"], ["companies", "Компании"], ["practice", "Практика"]] as const;

export default function UniversityStudentsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = tabs.some(([k]) => k === sp.get("tab")) ? sp.get("tab")! : "students";
  return (
    <PageFrame title="Студенты и практика">
      <ul className="nav nav-tabs mb-3">
        {tabs.map(([k, label]) => (
          // при смене вкладки фильтры, поиск и сортировка предыдущей сбрасываются
          <li className="nav-item" key={k}><button className={`nav-link ${tab === k ? "active" : ""}`} onClick={() => setSp({ tab: k })}>{label}</button></li>
        ))}
      </ul>
      {tab === "students" && <UniversityStudents key="s" />}
      {tab === "companies" && <UniversityCompanies key="c" />}
      {tab === "practice" && <ApplicationsTable key="p" role="UNIVERSITY" />}
    </PageFrame>
  );
}
