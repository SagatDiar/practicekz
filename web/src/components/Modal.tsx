import { useEffect, type ReactNode } from "react";

interface Props { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: "" | "lg" | "xl" }

export default function Modal({ title, onClose, children, footer, size = "lg" }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="modal d-block" style={{ background: "rgba(15,23,42,.5)", zIndex: 1060 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${size ? `modal-${size}` : ""}`}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header"><h5 className="modal-title">{title}</h5><button type="button" className="btn-close" aria-label="Закрыть" onClick={onClose} /></div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
