import type { Request, Response, Router, RequestHandler } from "express";
import { toCsv } from "./csv.js";
import type { Actor } from "../services/applications.js";

export interface Pick { value: string; label: string }

/** Описание одного фильтра: как отфильтровать и как посчитать счётчики (facets). */
export interface FieldDef {
  where: (values: string[]) => any;
  select: any;
  pick: (row: any) => Pick | Pick[] | null | undefined;
  order?: "count" | "value";
}

export interface ListConfig {
  model: any;
  fields: Record<string, FieldDef>;
  base: (u: Actor) => any;
  search?: (q: string) => any;
  extra?: (query: Record<string, any>, u: Actor) => any;
  sorts: Record<string, (dir: "asc" | "desc") => any>;
  defaultSort: string;
  include: any;
  prepare?: (rows: any[], u: Actor) => Promise<any>;
  serialize: (row: any, ctx?: any) => any;
  csv?: (u: Actor) => { headers: string[]; row: (item: any) => (string | number | null | undefined)[] };
  fileName: string;
}

const LIMITS = [10, 25, 50, 100];
const arr = (v: unknown): string[] =>
  v === undefined ? [] : (Array.isArray(v) ? v : [v]).map(String).filter((s) => s !== "");

function parse(cfg: ListConfig, query: Record<string, any>) {
  const filters: Record<string, string[]> = {};
  for (const k of Object.keys(cfg.fields)) filters[k] = arr(query[k]).slice(0, 100);
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const lim = parseInt(String(query.limit ?? "10"), 10);
  const limit = LIMITS.includes(lim) ? lim : 10;
  const [key, dir] = String(query.sort ?? cfg.defaultSort).split(":");
  const sort = Object.hasOwn(cfg.sorts, key) ? { key, dir: (dir === "asc" ? "asc" : "desc") as "asc" | "desc" } : (() => {
    const [k, d] = cfg.defaultSort.split(":");
    return { key: k, dir: d as "asc" | "desc" };
  })();
  return { filters, q, page, limit, sort };
}

function buildWhere(cfg: ListConfig, u: Actor, query: Record<string, any>, p: ReturnType<typeof parse>, exclude?: string) {
  const AND: any[] = [cfg.base(u)];
  if (p.q && cfg.search) AND.push(cfg.search(p.q));
  for (const [k, v] of Object.entries(p.filters)) if (k !== exclude && v.length) AND.push(cfg.fields[k].where(v));
  const ex = cfg.extra?.(query, u);
  if (ex) AND.push(ex);
  return { AND };
}

export async function runList(cfg: ListConfig, u: Actor, query: Record<string, any>) {
  const p = parse(cfg, query);
  const where = buildWhere(cfg, u, query, p);
  const orderBy = [cfg.sorts[p.sort.key](p.sort.dir), { id: "asc" }];
  const [total, rows] = await Promise.all([
    cfg.model.count({ where }),
    cfg.model.findMany({ where, include: cfg.include, orderBy, skip: (p.page - 1) * p.limit, take: p.limit }),
  ]);
  const ctx = cfg.prepare ? await cfg.prepare(rows, u) : undefined;
  return { items: rows.map((r: any) => cfg.serialize(r, ctx)), total, page: p.page, limit: p.limit, pages: Math.max(1, Math.ceil(total / p.limit)) };
}

/**
 * Счётчики для панели фильтров. Для каждой группы условие строится БЕЗ её собственного фильтра
 * (чтобы можно было выбрать ещё одно значение в этой группе); остальные фильтры и поиск учитываются.
 */
export async function runFacets(cfg: ListConfig, u: Actor, query: Record<string, any>) {
  const p = parse(cfg, query);
  const wanted = arr(query.facets);
  const keys = Object.keys(cfg.fields).filter((k) => !wanted.length || wanted.includes(k));
  const out: Record<string, { value: string; label: string; count: number }[]> = {};
  await Promise.all(keys.map(async (k) => {
    const def = cfg.fields[k];
    const rows = await cfg.model.findMany({ where: buildWhere(cfg, u, query, p, k), select: def.select, take: 50000 });
    const map = new Map<string, { value: string; label: string; count: number }>();
    for (const r of rows) {
      const picked = def.pick(r);
      const list = picked == null ? [] : Array.isArray(picked) ? picked : [picked];
      for (const it of new Map(list.map((x) => [x.value, x])).values()) {
        const cur = map.get(it.value);
        if (cur) cur.count++; else map.set(it.value, { ...it, count: 1 });
      }
    }
    const items = [...map.values()];
    items.sort(def.order === "value"
      ? (a, b) => Number(a.value) - Number(b.value)
      : (a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"));
    out[k] = items;
  }));
  return out;
}

export async function runCsv(cfg: ListConfig, u: Actor, query: Record<string, any>) {
  if (!cfg.csv) throw new Error("CSV не поддерживается");
  const p = parse(cfg, query);
  const where = buildWhere(cfg, u, query, p);
  const rows = await cfg.model.findMany({
    where, include: cfg.include, orderBy: [cfg.sorts[p.sort.key](p.sort.dir), { id: "asc" }], take: 50000,
  });
  const ctx = cfg.prepare ? await cfg.prepare(rows, u) : undefined;
  const { headers, row } = cfg.csv(u);
  return toCsv(headers, rows.map((r: any) => row(cfg.serialize(r, ctx))));
}

/** Подключает GET /facets, GET /export.csv и GET / — вызывать ДО маршрутов вида /:id. */
export function mountList(router: Router, cfg: ListConfig, guards: RequestHandler[] = []) {
  router.get("/facets", ...guards, async (req: Request, res: Response) => {
    res.json({ facets: await runFacets(cfg, req.user!, req.query) });
  });
  if (cfg.csv) {
    router.get("/export.csv", ...guards, async (req: Request, res: Response) => {
      const csv = await runCsv(cfg, req.user!, req.query);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${cfg.fileName}-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    });
  }
  router.get("/", ...guards, async (req: Request, res: Response) => {
    res.json(await runList(cfg, req.user!, req.query));
  });
}

/** Условие where для произвольного ListConfig: роль, фильтры и диапазон дат — для статистики и других агрегатов. */
export function listWhere(cfg: ListConfig, u: Actor, query: Record<string, any>) {
  return buildWhere(cfg, u, query, parse(cfg, query));
}
