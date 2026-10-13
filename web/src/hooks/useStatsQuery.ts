import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Facets } from "../api/list";
import type { StatResult } from "../api/stats";
import type { Role } from "../api/types";
import { extraKeys, filterKeys } from "../components/filters/filterConfigs";
import type { StatTab } from "../stats/statsConfig";

/**
 * Состояние статистики живёт в URL: ?tab=faculties&faculty=…&dateFrom=…
 * Загружается только активная вкладка; при смене вкладки остаются лишь те фильтры, что к ней применимы.
 */
export function useStatsQuery(role: Role, tabs: StatTab[]) {
  const [sp, setSp] = useSearchParams();
  const tab = tabs.find((t) => t.key === sp.get("tab")) ?? tabs[0];
  const fKeys = filterKeys(tab.groups);
  const eKeys = extraKeys(tab.groups);

  const filters: Record<string, string[]> = Object.fromEntries(fKeys.map((k) => [k, sp.getAll(k)]));
  const extras: Record<string, string> = Object.fromEntries(eKeys.map((k) => [k, sp.get(k) ?? ""]));

  const qs = (() => {
    const n = new URLSearchParams();
    for (const k of fKeys) filters[k].forEach((v) => n.append(k, v));
    for (const k of eKeys) if (extras[k]) n.set(k, extras[k]);
    return n.toString();
  })();
  const roleKey = role.toLowerCase();
  const sep = qs ? "&" : "";

  const result = useQuery({
    queryKey: ["stats", roleKey, tab.key, qs],
    queryFn: () => api<StatResult>(`/stats/${roleKey}/${tab.key}${qs ? "?" + qs : ""}`),
    placeholderData: keepPreviousData,
  });
  const facets = useQuery({
    queryKey: ["stats", "facets", tab.source, qs],
    queryFn: () => api<{ facets: Facets }>(`/stats/facets?source=${tab.source}${sep}${qs}`).then((r) => r.facets),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const update = (mut: (n: URLSearchParams) => void, replace = true) =>
    setSp((prev) => { const n = new URLSearchParams(prev); mut(n); return n; }, { replace });

  return {
    tab, filters, extras, qs, result, facets: facets.data ?? {},
    activeCount: fKeys.filter((k) => filters[k].length).length + eKeys.filter((k) => extras[k]).length,
    csvUrl: `/api/stats/${roleKey}/${tab.key}?${qs}${sep}format=csv`,
    setTab: (key: string) => {
      const next = tabs.find((t) => t.key === key);
      if (!next) return;
      const keep = new Set([...filterKeys(next.groups), ...extraKeys(next.groups)]);
      update((n) => {
        n.set("tab", key);
        for (const k of new Set([...fKeys, ...eKeys])) if (!keep.has(k)) n.delete(k);
      }, false);
    },
    apply: (f: Record<string, string[]>, e: Record<string, string>) =>
      update((n) => {
        for (const k of fKeys) { n.delete(k); (f[k] ?? []).forEach((v) => n.append(k, v)); }
        for (const k of eKeys) { if (e[k]) n.set(k, e[k]); else n.delete(k); }
      }),
    removeFilterValue: (k: string, v: string) =>
      update((n) => { const rest = n.getAll(k).filter((x) => x !== v); n.delete(k); rest.forEach((x) => n.append(k, x)); }),
    removeExtra: (...keys: string[]) => update((n) => keys.forEach((k) => n.delete(k))),
    resetAll: () => update((n) => [...fKeys, ...eKeys].forEach((k) => n.delete(k))),
  };
}
