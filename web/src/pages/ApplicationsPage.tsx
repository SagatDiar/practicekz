import { useAuth } from "../auth/AuthContext";
import PageFrame from "../components/PageFrame";
import ApplicationsTable from "../components/tables/ApplicationsTable";

export default function ApplicationsPage() {
  const { user } = useAuth();
  return (
    <PageFrame title={user!.role === "STUDENT" ? "Мои заявки" : "Заявки студентов"}>
      <ApplicationsTable role={user!.role} />
    </PageFrame>
  );
}
