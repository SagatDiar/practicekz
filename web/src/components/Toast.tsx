import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface T { id: number; kind: "success" | "danger" | "info"; text: string }
interface Ctx { ok: (t: string) => void; err: (t: string) => void; info: (t: string) => void }
const ToastCtx = createContext<Ctx>({ ok() {}, err() {}, info() {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((kind: T["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, kind, text }]);
    setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 4500);
  }, []);
  const value: Ctx = { ok: (t) => push("success", t), err: (t) => push("danger", t), info: (t) => push("info", t) };
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-container position-fixed top-0 end-0 p-3" style={{ zIndex: 2000 }}>
        {items.map((t) => (
          <div key={t.id} className={`toast show align-items-center text-bg-${t.kind} border-0 mb-2`} role="alert">
            <div className="d-flex"><div className="toast-body">{t.text}</div>
              <button type="button" className="btn-close btn-close-white me-2 m-auto" onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))} /></div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
