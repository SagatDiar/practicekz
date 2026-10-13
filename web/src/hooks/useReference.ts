import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export const useReference = (name: "cities" | "faculties" | "specialties") =>
  useQuery({ queryKey: ["ref", name], queryFn: () => api<{ items: string[] }>(`/reference/${name}`).then((r) => r.items), staleTime: Infinity }).data ?? [];

/** После любого действия по заявке или практике обновляем все связанные списки и сводки. */
export function useRefreshData() {
  const qc = useQueryClient();
  return () => Promise.all(["/applications", "/practices", "/students", "dashboard", "application", "stats"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
