import { Navigate, Outlet } from "react-router-dom";
import type { Role } from "../api/types";
import { homePath, useAuth } from "../auth/AuthContext";

export default function RoleGuard({ role }: { role: Role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homePath(user.role)} replace />; // чужая роль → свой раздел
  return <Outlet />;
}
