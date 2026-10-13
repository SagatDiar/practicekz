import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Paged, RegistryUniversity } from "../../api/types";
import { useDebounced } from "../../hooks/useDebounced";

interface Props { value: string; onChange: (id: string, u?: RegistryUniversity) => void; error?: string }

/** Выбор ВУЗа из реестра РК: поиск по названию или сокращению, результаты приходят с сервера. */
export default function UniversityPicker({ value, onChange, error }: Props) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<RegistryUniversity | null>(null);
  const q = useDebounced(text.trim(), 300);
  const { data, isFetching } = useQuery({
    queryKey: ["registry-universities", q],
    queryFn: () => api<Paged<RegistryUniversity>>(`/registry/universities?limit=25${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    staleTime: 60_000,
    enabled: !picked,
  });

  if (picked && value) {
    return (
      <div className="border rounded p-2 d-flex justify-content-between align-items-center">
        <div><b>{picked.shortName}</b> — {picked.name}<div className="small text-muted">{picked.city}</div></div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setPicked(null); onChange(""); }}>Изменить</button>
      </div>
    );
  }
  return (
    <div>
      <input className={`form-control ${error ? "is-invalid" : ""}`} placeholder="Начните вводить название или сокращение ВУЗа" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="list-group mt-1" style={{ maxHeight: 220, overflowY: "auto" }}>
        {data?.items.map((u) => (
          <button type="button" key={u.id} className="list-group-item list-group-item-action py-2" onClick={() => { setPicked(u); onChange(u.id, u); }}>
            <span className="fw-semibold">{u.shortName}</span> — {u.name}
            <span className="text-muted small"> · {u.city}</span>
            {u.onPlatform && <span className="badge bg-success ms-2">на платформе</span>}
          </button>
        ))}
        {data && data.items.length === 0 && <div className="list-group-item text-muted small">Такого ВУЗа нет в реестре. Попробуйте другое название.</div>}
        {isFetching && !data && <div className="list-group-item text-muted small">Загрузка…</div>}
      </div>
      {data && data.total > data.items.length && <div className="form-text">Показано {data.items.length} из {data.total} — уточните поиск</div>}
    </div>
  );
}
