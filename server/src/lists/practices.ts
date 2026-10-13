import { prisma } from "../utils/db.js";
import type { ListConfig } from "../utils/listEngine.js";

const companyPick = (r: any) => ({ value: r.companyId, label: r.company.company?.companyName ?? "" });
const nums = (v: string[]) => v.map(Number).filter(Number.isFinite);
const plain = (key: string) => ({
  where: (v: string[]) => ({ [key]: { in: v } }),
  select: { [key]: true },
  pick: (r: any) => ({ value: r[key], label: r[key] }),
});

export const include = { company: { include: { company: true } }, _count: { select: { applications: true } } };

export const practicesList: ListConfig = {
  model: prisma.practice,
  fileName: "practices",
  include,
  fields: {
    city: plain("city"),
    format: plain("format"),
    direction: plain("direction"),
    duration: {
      where: (v) => ({ durationMonths: { in: nums(v) } }),
      select: { durationMonths: true },
      pick: (r) => ({ value: String(r.durationMonths), label: `${r.durationMonths} мес.` }),
      order: "value",
    },
    company: {
      where: (v) => ({ companyId: { in: v } }),
      select: { companyId: true, company: { select: { company: { select: { companyName: true } } } } },
      pick: companyPick,
    },
  },
  base: () => ({}),
  // компания по умолчанию видит только свои практики (mine=0 — все); студент может скрыть уже поданные
  extra: (q, u) => {
    const parts: any[] = [];
    if (u.role === "COMPANY" && q.mine !== "0") parts.push({ companyId: u.id });
    if (u.role === "STUDENT" && q.hideApplied === "1") parts.push({ applications: { none: { studentId: u.id } } });
    return parts.length ? { AND: parts } : undefined;
  },
  search: (q) => ({
    OR: ["title", "direction", "city"].map((f) => ({ [f]: { contains: q, mode: "insensitive" } }))
      .concat([{ company: { company: { companyName: { contains: q, mode: "insensitive" } } } } as any]),
  }),
  sorts: {
    date: (d) => ({ datePublished: d }),
    title: (d) => ({ title: d }),
    company: (d) => ({ company: { company: { companyName: d } } }),
    places: (d) => ({ places: d }),
  },
  defaultSort: "date:desc",
  prepare: async (rows, u) => {
    if (u.role !== "STUDENT") return new Set<string>();
    const mine = await prisma.application.findMany({
      where: { studentId: u.id, practiceId: { in: rows.map((r) => r.id) } }, select: { practiceId: true },
    });
    return new Set(mine.map((a) => a.practiceId));
  },
  serialize: (p, applied?: Set<string>) => practiceView(p, applied),
};

export function practiceView(p: any, applied?: Set<string>) {
  return {
    id: p.id, title: p.title, city: p.city, direction: p.direction, description: p.description,
    requirements: p.requirements, durationMonths: p.durationMonths, format: p.format, places: p.places,
    datePublished: p.datePublished,
    company: { id: p.companyId, name: p.company.company?.companyName ?? "" },
    applicationsCount: p._count.applications,
    ...(applied ? { applied: applied.has(p.id) } : {}),
  };
}
