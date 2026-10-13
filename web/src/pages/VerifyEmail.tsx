import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { post } from "../api/client";
import { homePath, useAuth } from "../auth/AuthContext";

interface State { email?: string; devCode?: string }

/** Шаг 2 регистрации и «авторизации с проверкой»: вводим 6-значный код из письма. */
export default function VerifyEmail() {
  const { user, verifyEmail } = useAuth();
  const nav = useNavigate();
  const st = (useLocation().state ?? {}) as State;
  const [email] = useState(st.email ?? "");
  const [devCode, setDevCode] = useState(st.devCode);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(60);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (user) return <Navigate to={homePath(user.role)} replace />;
  if (!email) return <Navigate to="/login" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(""); setInfo(""); setBusy(true);
    try {
      const u = await verifyEmail(email, code.trim());
      nav(homePath(u.role), { replace: true });
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function resend() {
    setError(""); setInfo("");
    try {
      const r = await post<{ ok: true; devCode?: string }>("/auth/resend-code", { email });
      setDevCode(r.devCode); setWait(60); setInfo("Если такой аккаунт ждёт подтверждения, мы отправили новый код");
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card"><div className="card-body p-4 p-md-5">
        <div className="brand mb-2">Подтвердите email</div>
        <p className="text-muted">Мы отправили 6-значный код на <b>{email}</b>. Он действует 15 минут.</p>
        {devCode && (
          <div className="alert alert-warning py-2 small">
            Режим разработки (почта не настроена): код — <b className="fs-6">{devCode}</b>. Задайте <code>SMTP_HOST</code> в <code>.env</code>, чтобы коды уходили на почту.
          </div>
        )}
        <form onSubmit={submit} noValidate>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          {info && <div className="alert alert-success py-2">{info}</div>}
          <input className="form-control form-control-lg text-center mb-3" style={{ letterSpacing: ".4em" }} inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} placeholder="••••••" value={code} autoFocus onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Код из письма" />
          <button className="btn btn-primary w-100" disabled={busy || code.length !== 6}>{busy ? "Проверка…" : "Подтвердить"}</button>
        </form>
        <div className="d-flex justify-content-between align-items-center mt-3 small">
          <button type="button" className="btn btn-link p-0" disabled={wait > 0} onClick={resend}>{wait > 0 ? `Отправить код снова (${wait} с)` : "Отправить код снова"}</button>
          <Link to="/login">Ко входу</Link>
        </div>
      </div></div>
    </div>
  );
}
