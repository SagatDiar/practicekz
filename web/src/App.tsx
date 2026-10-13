import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import RegistryPage from "./pages/RegistryPage";
import RoleGuard from "./components/RoleGuard";
import DashboardPage from "./pages/DashboardPage";
import PracticeListPage from "./pages/PracticeListPage";
import ApplicationsPage from "./pages/ApplicationsPage";
import DiaryPage from "./pages/DiaryPage";
import ProfilePage from "./pages/ProfilePage";
import AddPracticePage from "./pages/AddPracticePage";
import UniversityStudentsPage from "./pages/UniversityStudentsPage";
// диаграммы (chart.js) грузятся отдельным файлом только при заходе в статистику
const StatsPage = lazy(() => import("./pages/StatsPage"));
import RealtimeProvider from "./components/RealtimeProvider";

export default function App() {
  return (
    <>
    <RealtimeProvider />
    <Suspense fallback={<div className="text-center p-5"><div className="spinner-border text-primary" /></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/registry" element={<RegistryPage />} />
      <Route element={<RoleGuard role="STUDENT" />}>
        <Route path="/student" element={<DashboardPage />} />
        <Route path="/student/practices" element={<PracticeListPage />} />
        <Route path="/student/applications" element={<ApplicationsPage />} />
        <Route path="/student/diary" element={<DiaryPage />} />
        <Route path="/student/stats" element={<StatsPage />} />
        <Route path="/student/profile" element={<ProfilePage />} />
      </Route>
      <Route element={<RoleGuard role="COMPANY" />}>
        <Route path="/company" element={<DashboardPage />} />
        <Route path="/company/practices" element={<PracticeListPage />} />
        <Route path="/company/new" element={<AddPracticePage />} />
        <Route path="/company/applications" element={<ApplicationsPage />} />
        <Route path="/company/stats" element={<StatsPage />} />
        <Route path="/company/profile" element={<ProfilePage />} />
      </Route>
      <Route element={<RoleGuard role="UNIVERSITY" />}>
        <Route path="/university" element={<DashboardPage />} />
        <Route path="/university/students" element={<UniversityStudentsPage />} />
        <Route path="/university/stats" element={<StatsPage />} />
        <Route path="/university/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
    </>
  );
}
