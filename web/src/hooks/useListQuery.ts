import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Facets, Paged } from "../api/list";

export interface ListOptions {
  endpoint: string;            // например "/applications"
  filterKeys: string[];        // многозначные фильтры (?status=A&status=B)
  extraKeys?: string[];        // одиночные параметры (dateFrom, dateTo, hideApplied)
  defaultSort: string;         // "date:desc"
  fixed?: Record<string, string>; // всегда добавляются к запросу (например mine=0)
}

/** Всё состояние списка живёт в URL: фильтры, поиск, страница, сортировка. Данные, счётчики и CSV — с сервера. */
export function useListQuery<T>(o: ListOptions) {
  const [sp, setSp] = useSearchParams();
  const extraKeys = o.extraKeys ?? [];

  const filters: Record<string, string[]> = Object.fromEntries(o.filterKeys.map((k) => [k, sp.getAll(k)]));
  const extras: Record<string, string> = Object.fromEntries(extraKeys.map((k) => [k, sp.get(k) ?? ""]));
  const q = sp.get("q") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const limit = Number(sp.get("limit") ?? 10) || 10;
  const sort = sp.get("sort") ?? o.defaultSort;

  const update = (mut: (n: URLSearchParams) => void, resetPage = true) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      mut(n);
      if (resetPage) n.delete("page");
      return n;
    }, { replace: true });

  const known = [...o.filterKeys, ...extraKeys];
  // строка запроса без page/limit/sort — общая для списка, счётчиков и экспорта
  const filterQs = (() => {
    const n = new URLSearchParams();
    if (q) n.set("q", q);
    for (const k of o.filterKeys) filters[k].forEach((v) => n.append(k, v));
    for (const k of extraKeys) if (extras[k]) n.set(k, extras[k]);
    for (const [k, v] of Object.entries(o.fixed ?? {})) n.set(k, v);
    return n.toString();
  })();
  const listQs = `${filterQs}${filterQs ? "&" : ""}page=${page}&limit=${limit}&sort=${encodeURIComponent(sort)}`;

  const list = useQuery({
    queryKey: [o.endpoint, "list", listQs],
    queryFn: () => api<Paged<T>>(`${o.endpoint}?${listQs}`),
    placeholderData: keepPreviousData,
  });
  const facets = useQuery({
    queryKey: [o.endpoint, "facets", filterQs],
    queryFn: () => api<{ facets: Facets }>(`${o.endpoint}/facets?${filterQs}`).then((r) => r.facets),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const activeCount = o.filterKeys.filter((k) => filters[k].length).length + extraKeys.filter((k) => extras[k]).length;

  return {
    filters, extras, q, page, limit, sort, activeCount,
    list, facets: facets.data ?? {}, exportUrl: `/api${o.endpoint}/export.csv?${filterQs}&sort=${encodeURIComponent(sort)}`,
    setQ: (v: string) => update((n) => (v ? n.set("q", v) : n.delete("q"))),
    setPage: (p: number) => update((n) => n.set("page", String(p)), false),
    setLimit: (l: number) => update((n) => n.set("limit", String(l))),
    setSort: (s: string) => update((n) => n.set("sort", s)),
    /** применить сразу несколько фильтров и extras (кнопка «Применить») */
    apply: (f: Record<string, string[]>, e: Record<string, string>) =>
      update((n) => {
        for (const k of o.filterKeys) { n.delete(k); (f[k] ?? []).forEach((v) => n.append(k, v)); }
        for (const k of extraKeys) { if (e[k]) n.set(k, e[k]); else n.delete(k); }
      }),
    removeFilterValue: (k: string, v: string) =>
      update((n) => { const rest = n.getAll(k).filter((x) => x !== v); n.delete(k); rest.forEach((x) => n.append(k, x)); }),
    removeExtra: (...keys: string[]) => update((n) => keys.forEach((k) => n.delete(k))),
    resetAll: () => update((n) => { known.forEach((k) => n.delete(k)); n.delete("q"); }),
  };
}

export type ListState<T> = ReturnType<typeof useListQuery<T>>;
