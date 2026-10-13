import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { homePath, useAuth } from "../auth/AuthContext";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homePath(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const u = await login(email, password);
      nav(homePath(u.role), { replace: true });
    } catch (err) {
      // пароль верный, но email не подтверждён: новый код уже отправлен — переходим к вводу кода
      if (err instanceof ApiError && err.data.code === "EMAIL_NOT_VERIFIED") {
        nav("/verify-email", { state: { email: err.data.email ?? email, devCode: err.data.devCode } });
        return;
      }
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card"><div className="card-body p-4 p-md-5">
        <div className="brand mb-1">PracticeKZ</div>
        <p className="text-muted mb-4">Платформа организации практики</p>
        <form onSubmit={submit}>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input className="form-control" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="form-label">Пароль</label>
            <input className="form-control" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary w-100" disabled={busy}>{busy ? "Вход…" : "Войти"}</button>
        </form>
        <div className="text-center mt-3">Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></div>
        <div className="text-center mt-2"><Link to="/registry" className="small text-muted"><i className="bi bi-database me-1" />Реестры ВУЗов и организаций РК</Link></div>
      </div></div>
    </div>
  );
}
