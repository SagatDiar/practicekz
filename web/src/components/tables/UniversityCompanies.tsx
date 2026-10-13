import ListShell from "../filters/ListShell";
import SortHeader from "../filters/SortHeader";
import { extraKeys, filterKeys, universityCompanyGroups } from "../filters/filterConfigs";
import { useListQuery } from "../../hooks/useListQuery";

interface Row { id: string; name: string; industry: string; city: string; offers: number }

export default function UniversityCompanies() {
  const state = useListQuery<Row>({ endpoint: "/companies", filterKeys: filterKeys(universityCompanyGroups), extraKeys: extraKeys(universityCompanyGroups), defaultSort: "name:asc" });
  const H = (label: string, field: string) => <SortHeader label={label} field={field} sort={state.sort} onSort={state.setSort} />;
  return (
    <ListShell state={state} groups={universityCompanyGroups} csv placeholder="Поиск по названию, сфере, городу…">
      {(items) => (
        <div className="table-responsive bg-white rounded-3 shadow-sm">
          <table className="table table-hover align-middle mb-0">
            <thead><tr>{H("Компания", "name")}{H("Сфера", "industry")}{H("Город", "city")}{H("Предложений", "offers")}</tr></thead>
            <tbody>{items.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.industry}</td><td>{c.city}</td><td>{c.offers}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </ListShell>
  );
}
