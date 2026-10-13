import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { EntityLookup } from "../../api/types";

interface Props { bin: string; onResult: (e: EntityLookup | null) => void }

/** Когда введено 12 цифр, спрашивает реестр юрлиц и показывает найденную организацию (название берётся оттуда, а не из формы). */
export default function BinLookup({ bin, onResult }: Props) {
  const digits = bin.replace(/\D/g, "");
  const { data, error, isFetching } = useQuery({
    queryKey: ["bin", digits],
    queryFn: () => api<EntityLookup>(`/registry/legal-entities/lookup?bin=${digits}`),
    enabled: digits.length === 12,
    retry: false,
    staleTime: 30_000,
  });
  useEffect(() => { onResult(digits.length === 12 && data ? data : null); /* eslint-disable-next-line */ }, [data, digits]);

  if (digits.length === 0) return <div className="form-text">12 цифр. Название организации подтянется из реестра юридических лиц РК.</div>;
  if (digits.length < 12) return <div className="form-text">Введено {digits.length} из 12 цифр</div>;
  if (isFetching) return <div className="form-text">Проверяем по реестру…</div>;
  if (error) return <div className="text-danger small mt-1"><i className="bi bi-x-circle me-1" />{(error as Error).message}</div>;
  if (!data) return null;
  if (!data.active) return <div className="text-danger small mt-1"><i className="bi bi-x-circle me-1" />Организация «{data.name}» не действует (ликвидирована)</div>;
  if (data.registered) return <div className="text-danger small mt-1"><i className="bi bi-x-circle me-1" />Компания «{data.name}» уже зарегистрирована на платформе</div>;
  return (
    <div className="alert alert-success py-2 mt-2 mb-0 small">
      <i className="bi bi-patch-check-fill me-1" />Найдено в реестре: <b>{data.name}</b>
      <div className="text-muted">{[data.legalForm, data.industry, data.city].filter(Boolean).join(" · ")}</div>
    </div>
  );
}
